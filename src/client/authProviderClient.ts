import * as firebase from 'firebase/app'
import 'firebase/auth'

export const firebaseLoaded = () =>
  new Promise((resolve) => {
    firebase.auth().onAuthStateChanged(resolve)
  })

export default (persistence: firebase.auth.Auth.Persistence) => ({
  login: async ({ username, password }) => {
    return firebase
      .auth()
      .setPersistence(persistence || firebase.auth.Auth.Persistence.LOCAL)
      .then(() =>
        firebase.auth().signInWithEmailAndPassword(username, password),
      )
      .then((c) => c.user.getIdToken())
  },
  logout: () => firebaseLoaded().then(() => firebase.auth().signOut()),
  checkAuth: () =>
    firebaseLoaded().then(() => {
      if (firebase.auth().currentUser) {
        return firebase.auth().currentUser.reload()
      } else {
        return Promise.reject({ redirectTo: '/login' })
      }
    }),
  checkError: (error: { code: string; message: string }) =>
    Promise.reject(error),
  getPermissions: () =>
    firebaseLoaded().then(() =>
      firebase.auth().currentUser
        ? firebase
            .auth()
            .currentUser.getIdTokenResult()
            .then((result) => result.claims)
        : Promise.reject(),
    ),
})
