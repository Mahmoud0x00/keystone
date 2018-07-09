/* eslint-disable jest/valid-expect */
const {
  getStaticListName,
  getDynamicListName,
  getDynamicForAdminOnlyListName,
  accessCombinations,
  stayLoggedIn,
} = require('../util');

function prettyListName(name) {
  return `${name}s`.replace(/[A-Z]/g, ' $&').trim();
}

function listSlug(name) {
  return `${name}s`.replace(/[A-Z]/g, '-$&').replace(/^-/, '').toLowerCase();
}

describe('Access Control Lists > Admin UI', () => {
  // Will become:
  // {
  //   "User": {
  //     "name": "String",
  //     "email": "String",
  //   },
  // }
  let listFields;

  before(() =>
    cy
      .task('getProjectInfo', 'access-control')
      .then(({ env: { PORT } }) =>
        cy.visit(`http://localhost:${PORT}/admin`).then(() =>
          cy
            .graphql_query(
              `http://localhost:${PORT}/admin/api`,
              `{
                __schema {
                  types {
                    name
                    fields {
                      name
                      type {
                        name
                      }
                    }
                  }
                }
              }`,
          )
          .then(({ data: { __schema: { types } } }) => {
            function toObject(arr, func) {
              return (arr || []).reduce(
                (memo, field) => Object.assign(
                  memo,
                  func(field)
                ),
                {},
              );
            }

            listFields = toObject(types, type => ({
              [type.name]: toObject(type.fields, field => ({
                [field.name]: field.type.name
              })),
            }));
          })
        )
      )
  );

  describe('Visibility', () => {
    describe('static config', () => {
      stayLoggedIn('su');

      accessCombinations.filter(({ read }) => !read).forEach(access => {
        it(`is not visible when not readable: ${JSON.stringify(access)}`, () => {

          const name = getStaticListName(access);
          const slug = `${name.toLowerCase()}s`;

          // When statically `read: false && create: false`, should not show
          // in the nav or main page, or have a route (ie; the admin ui shouldn't
          // know about it at all)
          cy.get('body').should('not.contain', name);

          cy
            .task('getProjectInfo', 'access-control')
            .then(({ env: { PORT } }) =>
              cy.visit(`http://localhost:${PORT}/admin/${slug}`)
            );

          cy.get('body').should('contain', `The list “${slug}” doesn't exist`);
        });
      });

      accessCombinations.filter(({ read }) => read).forEach(access => {
        it(`is visible when readable: ${JSON.stringify(access)}`, () => {
          const name = getStaticListName(access);
          const prettyName = prettyListName(name);
          const slug = listSlug(name);

          // TODO: Check body text too
          cy.get('body nav').should('contain', prettyName);

          cy
            .task('getProjectInfo', 'access-control')
            .then(({ env: { PORT } }) =>
              cy.visit(`http://localhost:${PORT}/admin/${slug}`)
            );

          cy.get('body').should('not.contain', `The list “${slug}” doesn't exist`);
          cy.get('body h1').should('contain', prettyName);
        });
      });
    });

    describe('read: dynamic config', () => {
      stayLoggedIn('su');

      accessCombinations.filter(({ read }) => read).forEach(access => {
        it(`shows items when readable: ${JSON.stringify(access)}`, () => {
          const name = getDynamicListName(access);
          const prettyName = prettyListName(name);
          const slug = listSlug(name);

          cy.get('body nav').should('contain', prettyName);

          cy
            .task('getProjectInfo', 'access-control')
            .then(({ env: { PORT } }) =>
              cy.visit(`http://localhost:${PORT}/admin/${slug}`)
            );

          cy.get('body').should('not.contain', 'You do not have access to this resource');
          cy.get('body h1').should('contain', prettyName);

          // TODO: Check for list of items too
        });
      });

      accessCombinations.filter(({ read }) => !read).forEach(access => {
        it(`shows an access restricted message when not readable: ${JSON.stringify(access)}`, () => {
          const name = getDynamicListName(access);
          const prettyName = prettyListName(name);
          const slug = listSlug(name);

          // Still navigable
          cy.get('body nav').should('contain', prettyName);

          cy
            .task('getProjectInfo', 'access-control')
            .then(({ env: { PORT } }) =>
              cy.visit(`http://localhost:${PORT}/admin/${slug}`)
            );

          // But shows an error on attempt to read
          cy.get('body').should('contain', 'You do not have access to this resource');

          // TODO: Check no items shown too
        });
      });
    });

    describe('read: dynamic config based on user', () => {
      describe('admin', () => {
        stayLoggedIn('su');

        accessCombinations.filter(({ read }) => read).forEach(access => {
          it(`shows items when readable & admin: ${JSON.stringify(access)}`, () => {
            const name = getDynamicForAdminOnlyListName(access);
            const prettyName = prettyListName(name);
            const slug = listSlug(name);

            cy.get('body nav').should('contain', prettyName);

            cy
              .task('getProjectInfo', 'access-control')
              .then(({ env: { PORT } }) =>
                cy.visit(`http://localhost:${PORT}/admin/${slug}`)
              );

            cy.get('body').should('not.contain', 'You do not have access to this resource');
            cy.get('body h1').should('contain', prettyName);

            // TODO: Check for list of items too
          });
        });

      });

      describe('non-admin', () => {
        stayLoggedIn('reader');

        accessCombinations.filter(({ read }) => read).forEach(access => {
          it(`does not show items when readable & not admin: ${JSON.stringify(access)}`, () => {
            const name = getDynamicForAdminOnlyListName(access);
            const prettyName = prettyListName(name);
            const slug = listSlug(name);

            // Still navigable
            cy.get('body nav').should('contain', prettyName);

            cy
              .task('getProjectInfo', 'access-control')
              .then(({ env: { PORT } }) =>
                cy.visit(`http://localhost:${PORT}/admin/${slug}`)
              );

            // But shows an error on attempt to read
            cy.get('body').should('contain', 'You do not have access to this resource');

            // TODO: Check no items shown too
          });
        });

      });
    });

  });

  describe('creating', () => {
    describe('static', () => {
      let PORT;
      stayLoggedIn('su', (vars) => { PORT = vars.PORT; });

      // NOTE: We only check lists that are readable as we've checked that
      // non-readable lists show access denied above
      accessCombinations.filter(({ create, read }) => create && read).forEach(access => {
        it(`shows create option when creatable (list view): ${JSON.stringify(access)}`, () => {
          const name = getStaticListName(access);
          const slug = listSlug(name);

          cy
            .task('getProjectInfo', 'access-control')
            .then(({ env: { PORT } }) =>
              cy.visit(`http://localhost:${PORT}/admin/${slug}`)
            );

          cy.get('button[appearance="create"]').should('exist');
        });

        it(`shows create option when creatable (item view): ${JSON.stringify(access)}`, () => {
          const name = getStaticListName(access);
          const queryName = `all${name}s`;
          const slug = listSlug(name);

          return cy
            .graphql_query(
              `http://localhost:${PORT}/admin/api`,
              `query { ${queryName}(first: 1) { id } }`
            )
            .then(({ data }) =>
              cy.visit(`http://localhost:${PORT}/admin/${slug}/${data[queryName][0].id}`)
                .then(() =>
                  cy.get('button[appearance="create"]').should('exist')
                )
            );
        });
      });

      accessCombinations.filter(({ create, read }) => !create && read).forEach(access => {
        it(`does not show create option when not creatable (list view): ${JSON.stringify(access)}`, () => {

          const name = getStaticListName(access);
          const slug = listSlug(name);

          cy
            .task('getProjectInfo', 'access-control')
            .then(({ env: { PORT } }) =>
              cy.visit(`http://localhost:${PORT}/admin/${slug}`)
            );

          cy.get('button[appearance="create"]').should('not.exist');
        });

        it(`does not show create option when not creatable (item view): ${JSON.stringify(access)}`, () => {
          const name = getStaticListName(access);
          const queryName = `all${name}s`;
          const slug = listSlug(name);

          return cy
            .graphql_query(
              `http://localhost:${PORT}/admin/api`,
              `query { ${queryName}(first: 1) { id } }`
            )
            .then(({ data }) => 
              cy.visit(`http://localhost:${PORT}/admin/${slug}/${data[queryName][0].id}`)
                .then(() =>
                  cy.get('button[appearance="create"]').should('not.exist')
                )
            );
        });
      });
    });

    describe('dynamic', () => {
      stayLoggedIn('su');

      // NOTE: We only check lists that are readable as we've checked that
      // non-readable lists show access denied above
      accessCombinations.filter(({ create, read }) => create && read).forEach(access => {
        it(`shows create option when creatable (list view): ${JSON.stringify(access)}`, () => {
          const name = getDynamicListName(access);
          const slug = listSlug(name);

          cy
            .task('getProjectInfo', 'access-control')
            .then(({ env: { PORT } }) =>
              cy.visit(`http://localhost:${PORT}/admin/${slug}`)
            );

          // Always shows create button, regardless of dynamic permission result.
          // ie; The UI has no way of executing the graphql-side permission
          // query, so must always show the option until the user submits a
          // graphql request.
          cy.get('button[appearance="create"]').should('exist');
        });

        it(`shows create option when creatable (item view): ${JSON.stringify(access)}`, () => {
          const name = getDynamicListName(access);
          const queryName = `all${name}s`;
          const slug = listSlug(name);

          return cy
            .task('getProjectInfo', 'access-control')
            .then(({ env: { PORT } }) =>
              cy
                .graphql_query(
                  `http://localhost:${PORT}/admin/api`,
                  `query { ${queryName}(first: 1) { id } }`
                )
                .then(({ data }) =>
                  cy.visit(`http://localhost:${PORT}/admin/${slug}/${data[queryName][0].id}`)
                    .then(() =>
                      cy.get('button[appearance="create"]').should('exist')
                    )
                )
            );
        });
      });
    });
  });

  describe('updating', () => {
    it('shows update item option when updatable', () => {

    });

    it('shows multi-update option when updatable', () => {

    });

    it('does not show update item option when not updatable', () => {

    });

    it('does not show the multi-update option when not updatable', () => {

    });

    describe.only('static', () => {
      stayLoggedIn('su');

      // NOTE: We only check lists that are readable as we've checked that
      // non-readable lists show access denied above
      accessCombinations.filter(({ update, read }) => update && read).forEach(access => {
        it(`shows update option when updatable (list view): ${JSON.stringify(access)}`, () => {
          const name = getStaticListName(access);
          const slug = listSlug(name);

          cy
            .task('getProjectInfo', 'access-control')
            .then(({ env: { PORT } }) =>
              cy.visit(`http://localhost:${PORT}/admin/${slug}`)
            );

          cy.get('button[data-test-name="manage"]').click();
          cy.get('button[data-test-name="update"]').should('exist');
        });

        it(`shows update option when updatable (item view): ${JSON.stringify(access)}`, () => {
          const name = getStaticListName(access);
          const queryName = `all${name}s`;
          const slug = listSlug(name);

          return cy
            .task('getProjectInfo', 'access-control')
            .then(({ env: { PORT } }) =>
              cy
                .graphql_query(
                  `http://localhost:${PORT}/admin/api`,
                  `query { ${queryName}(first: 1) { id } }`
                )
                .then(({ data }) => {
                  cy.visit(`http://localhost:${PORT}/admin/${slug}/${data[queryName][0].id}`);

                  return Promise.all(
                    Object.entries(listFields[name])
                      // Ignore the non-editable types
                      .filter(([ field ]) => !['id', '_label_'].includes(field))
                      .map(([ field ]) => {
                        cy.get(`label[for="ks-input-${field}"]`).should('exist')
                          .then(() =>
                            cy.get(`#ks-input-${field}`).should('exist')
                          )
                      })
                  );
                })

                // TODO: Check for "Save Changes" & "Reset Changes" buttons
            );
        });
      });

      accessCombinations.filter(({ update, read }) => !update && read).forEach(access => {
        it(`does not show update option when not updatable (list view): ${JSON.stringify(access)}`, () => {

          const name = getStaticListName(access);
          const slug = listSlug(name);

          cy
            .task('getProjectInfo', 'access-control')
            .then(({ env: { PORT } }) =>
              cy.visit(`http://localhost:${PORT}/admin/${slug}`)
            );

          cy.get('button[data-test-name="manage"]').click();
          cy.get('button[data-test-name="update"]').should('not.exist');
        });

        it(`does not show input fields when not updatable (item view): ${JSON.stringify(access)}`, () => {
          const name = getStaticListName(access);
          const queryName = `all${name}s`;
          const slug = listSlug(name);

          return cy
            .task('getProjectInfo', 'access-control')
            .then(({ env: { PORT } }) =>
              cy
                .graphql_query(
                  `http://localhost:${PORT}/admin/api`,
                  `query { ${queryName}(first: 1) { id } }`
                )
                .then(({ data }) => {
                  cy.visit(`http://localhost:${PORT}/admin/${slug}/${data[queryName][0].id}`);

                  return Promise.all(
                    Object.entries(listFields[name])
                      // Ignore the non-editable types
                      .filter(([ field ]) => !['id', '_label_'].includes(field))
                      .map(([ field ]) => {
                        cy.get(`label[for="ks-input-${field}"]`).should('exist')
                          .then(() =>
                            cy.get(`#ks-input-${field}`).should('not.exist')
                          )
                      }
                  )
                );
                })
            );

            // TODO: Check for "Save Changes" & "Reset Changes" buttons
        });
      });
    });

    describe('dynamic', () => {
      stayLoggedIn('su');

      // NOTE: We only check lists that are readable as we've checked that
      // non-readable lists show access denied above
      accessCombinations.filter(({ create, read }) => create && read).forEach(access => {
        it(`shows create option when creatable: ${JSON.stringify(access)}`, () => {
          const name = getDynamicListName(access);
          const slug = listSlug(name);

          cy
            .task('getProjectInfo', 'access-control')
            .then(({ env: { PORT } }) =>
              cy.visit(`http://localhost:${PORT}/admin/${slug}`)
            );

          // Always shows create button, regardless of dynamic permission result.
          // ie; The UI has no way of executing the graphql-side permission
          // query, so must always show the option until the user submits a
          // graphql request.
          cy.get('button[appearance="create"]').should('exist');
        });
      });
    });
  });

  describe('deleting', () => {
    it('shows delete item option when deletable', () => {

    });

    it('shows multi-delete option when deletable', () => {

    });

    it('does not show delete item option when not deletable', () => {

    });

    it('does not show the multi-delete option when not deletable', () => {

    });
  });
});
