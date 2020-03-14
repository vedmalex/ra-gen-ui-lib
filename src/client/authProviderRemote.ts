import gql from 'graphql-tag'
import ApolloClient from 'apollo-boost'

export default (client: ApolloClient<unknown>) => {
  const self = {
    login: ({ username, password }) =>
      client
        .mutate({
          mutation: gql`
            mutation login($username: String, $password: String) {
              login(username: $username, password: $password) {
                token
                refreshToken
                uid
                claims {
                  admin
                }
              }
            }
          `,
          variables: { username, password },
          // fetchPolicy: 'network-only',
        })
        .then((r) => {
          localStorage.setItem('uid', r.data.login.uid)
          localStorage.setItem('token', r.data.login.token)
          localStorage.setItem('refresh_token', r.data.login.refreshToken)
          localStorage.setItem('claims', JSON.stringify(r.data.login.claims))
          return Promise.resolve(r.data.login.uid)
        }),
    logout: () => {
      localStorage.removeItem('uid')
      localStorage.removeItem('claims')
      localStorage.removeItem('token')
      localStorage.removeItem('refresh_token')
      return Promise.resolve()
    },
    checkAuth: () =>
      new Promise((resolve, reject) => {
        return localStorage.getItem('token')
          ? client
              .mutate({
                mutation: gql`
                  mutation verifyToken($token: Token) {
                    claims: verifyToken(token: $token) {
                      admin
                    }
                  }
                `,
                variables: { token: localStorage.getItem('token') },
                fetchPolicy: 'no-cache',
              })
              .then((r) => {
                localStorage.setItem('claims', JSON.stringify(r.data?.claims))
                resolve()
              })
              .catch((e) => {
                localStorage.getItem('refresh_token')
                  ? client
                      .mutate({
                        mutation: gql`
                          mutation refreshToken($token: Token) {
                            refreshToken(token: $token) {
                              token
                              refreshToken
                              uid
                              claims {
                                admin
                              }
                            }
                          }
                        `,
                        variables: {
                          token: localStorage.getItem('refresh_token'),
                        },
                        fetchPolicy: 'no-cache',
                      })
                      .then((r) => {
                        localStorage.setItem('uid', r.data.refreshToken.uid)
                        localStorage.setItem('token', r.data.refreshToken.token)
                        localStorage.setItem(
                          'refresh_token',
                          r.data.refreshToken.refreshToken,
                        )
                        localStorage.setItem(
                          'claims',
                          JSON.stringify(r.data.refreshToken.claims),
                        )
                      })
                      .catch((e) => reject(e))
                  : reject(e)
              })
          : reject()
      }),
    checkError: async (error: {
      networkError?: { statusCode: number }
      message?: string
    }) => {
      return self
        .checkAuth()
        .then((_) => Promise.resolve())
        .catch((_) => {
          console.log('checkAuth->catch', _)
          if (contains(error, 'auth/id-token-expired')) {
            return self.checkAuth()
          } else {
            if (
              error.networkError?.statusCode === 400 ||
              error.networkError?.statusCode === 403
            )
              console.log(error)
            return Promise.reject(error.message)
          }
        })
    },
    getPermissions: () => {
      if (
        localStorage.getItem('uid') &&
        localStorage.getItem('claims') &&
        localStorage.getItem('token') &&
        localStorage.getItem('refresh_token')
      ) {
        return Promise.resolve(JSON.parse(localStorage.getItem('claims')))
      } else {
        return Promise.reject()
      }
    },
  }
  return self
}

function contains(obj, text) {
  console.log(text)
  if (typeof obj === 'object' && obj) {
    return Object.keys(obj).some((f) => contains(obj[f], text))
  } else {
    if (typeof obj === 'string') {
      return new RegExp(text, 'i').test(obj)
    } else {
      return false
    }
  }
}
