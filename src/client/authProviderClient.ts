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
    //.then(token => localStorage.setItem('token', token));
  },
  logout: () => {
    localStorage.removeItem('token')
    firebase.auth().signOut()
    return Promise.resolve()
  },
  checkAuth: () =>
    firebaseLoaded().then(() => {
      if (firebase.auth().currentUser) {
        return firebase.auth().currentUser.reload()
        //.then(_ => firebase.auth().currentUser.getIdToken());
        //.then(token => localStorage.setItem('token', token));
      } else {
        return Promise.reject()
      }
    }),
  checkError: (error: { code: string; message: string }) =>
    Promise.resolve(error.message),
  getPermissions: () =>
    firebase.auth().currentUser
      ? firebase
          .auth()
          .currentUser.getIdTokenResult()
          .then((result) => result.claims)
      : Promise.reject(),
})
