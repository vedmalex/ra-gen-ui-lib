import {
  ApolloServer,
  gql,
  AuthenticationError,
  ApolloError,
} from 'apollo-server-micro'

import { ApolloClient } from 'apollo-client'
import { InMemoryCache, NormalizedCacheObject } from 'apollo-cache-inmemory'
import { SchemaLink } from 'apollo-link-schema'
import { makeExecutableSchema } from 'graphql-tools'

import GraphQLJSON, { GraphQLJSONObject } from 'graphql-type-json'
import { SchemaDirectiveVisitor } from 'graphql-tools'
import { defaultFieldResolver } from 'graphql'
import * as firebase from 'firebase/app'
import 'firebase/auth'

import fetch from 'isomorphic-unfetch'
import { GraphQLList, GraphQLDirective, DirectiveLocation } from 'graphql'
import * as admin from 'firebase-admin'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const serviceAccount = require('../configure/account.json')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const client = require('../configure/client.json')

if (!firebase.apps.length) {
  firebase.initializeApp(client)
}
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  })
}

export const typeDefs = gql`
  scalar ID
  scalar UID
  scalar Date
  scalar Url
  scalar JSON
  scalar JSONObject
  scalar Token

  enum Acl {
    AUTHENTICATED
    ADMIN
    STUDENT
    CAPITAN
    CURATOR
    OWNER
  }

  directive @acl(level: [Acl] = [AUTHENTICATED]) on OBJECT | FIELD_DEFINITION

  directive @storage(
    identity: Boolean
    indexed: Boolean
    calculated: Boolean
  ) on FIELD_DEFINITION

  directive @entry(calculated: Boolean) on OBJECT
  enum RelationType {
    BTM
    BTO
    HM
    HO
  }

  directive @relation(
    type: RelationType
    to: String
    from: String
    using: String
  ) on FIELD_DEFINITION

  directive @UI(
    title: String
    titlePlural: String
    hint: String
    generalTab: String
    listName: String
    list: Boolean
    edit: Boolean
  ) on OBJECT | FIELD_DEFINITION

  type UserClaim {
    admin: Boolean
    student: Boolean
    capitan: Boolean
    curator: Boolean
    owner: Boolean
  }

  input UserClaimInput {
    admin: Boolean
    student: Boolean
    capitan: Boolean
    curator: Boolean
    owner: Boolean
  }

  type FireBaseUserInfo {
    displayName: String
    email: String
    phoneNumber: String
    photoURL: Url
    providerId: ID
    uid: UID
  }

  type FireBaseUserMetadata {
    creationTime: String
    lastSignInTime: String
  }

  type FireBaseUser {
    displayName: String
    email: String
    phoneNumber: String
    photoURL: Url
    providerId: ID
    emailVerified: Boolean
    isAnonymous: Boolean @storage(calculated: true)
    metadata: FireBaseUserMetadata
    providerData: [FireBaseUserInfo]
    refreshToken: String
    tenantId: String
    uid: UID
    options: UserClaim
  }

  input FirebaseUserCreate {
    # The uid to assign to the newly created user. Must be a string between 1 and 128 characters long, inclusive. If not provided, a random uid will be automatically generated.
    uid: UID
    #	The user's primary email. Must be a valid email address.
    email: String!
    # Whether or not the user's primary email is verified. If not provided, the default is false.
    emailVerified: Boolean
    # The user's primary phone number. Must be a valid E.164 spec compliant phone number.
    phoneNumber: String
    # The user's raw, unhashed password. Must be at least six characters long.
    password: String!
    # The users' display name.
    displayName: String
    # The user's photo URL.
    photoURL: Url
    # Whether or not the user is disabled. true for disabled; false for enabled. If not provided, the default is false.
    disabled: Boolean
    claims: UserClaimInput
  }

  input FirebaseUserUpdate {
    #	The user's primary email. Must be a valid email address.
    email: String!
    # Whether or not the user's primary email is verified. If not provided, the default is false.
    emailVerified: Boolean
    # The user's primary phone number. Must be a valid E.164 spec compliant phone number.
    phoneNumber: String
    # The user's raw, unhashed password. Must be at least six characters long.
    password: String!
    # The users' display name.
    displayName: String
    # The user's photo URL.
    photoURL: Url
    # Whether or not the user is disabled. true for disabled; false for enabled. If not provided, the default is false.
    disabled: Boolean
    claims: UserClaimInput
  }

  type AppUserList {
    users: [FireBaseUser]
    pageToken: String
  }

  type Query {
    getAppUser(uid: UID): FireBaseUser @acl(level: ADMIN)
    getAppUsers(limit: Int, pageToken: String): AppUserList @acl(level: ADMIN)
  }

  type LoginResult {
    token: Token!
    refreshToken: Token!
    uid: ID!
    options: UserClaim
  }

  type Mutation {
    login(username: String, password: String): LoginResult
    refreshToken(token: Token): LoginResult
    verifyToken(
      token: Token
      refreshToken: Token
      checkRevoked: Boolean
    ): UserClaim
    deleteAppUser(uid: UID): Boolean @acl(level: ADMIN)
    createAppUser(user: FirebaseUserCreate): FireBaseUser @acl(level: ADMIN)
    updateAppUser(uid: UID, user: FirebaseUserUpdate): FireBaseUser
      @acl(level: ADMIN)
  }
`

class AclDirective extends SchemaDirectiveVisitor {
  visitObject(type) {
    type._acl = this.args.level
    this.ensureWrapped(type)
  }
  visitSchemaDirectives
  visitFieldDefinition(field, details) {
    field._acl = this.args.level
    this.ensureWrapped(details.objectType)
  }
  ensureWrapped(objectType) {
    if (objectType._aclwrap == true) return
    objectType._aclwrap = true
    const fields = objectType.getFields()
    Object.keys(fields).forEach((fieldName) => {
      const field = fields[fieldName]
      const { resolve = defaultFieldResolver } = field
      field.resolve = async function(...args) {
        // Get the required Role from the field first, falling back
        // to the objectType if no Role is required by the field:
        const requiredRole = field._acl || objectType._acl

        if (!requiredRole) {
          return resolve.apply(this, args)
        }

        const context = args[2]
        switch (requiredRole) {
          case 'ADMIN':
            if (!context?.user?.options?.admin) {
              throw new AuthenticationError('not allowed to access')
            }
            break
          case 'AUTHENTICATED':
            if (!context?.user) {
              throw new AuthenticationError('not allowed to access')
            }
            break
        }
        return resolve.apply(this, args)
      }
    })
  }
  static getDirectiveDeclaration(directiveName, schema) {
    const previousDirective = schema.getDirective(directiveName)
    if (previousDirective) {
      // If a previous directive declaration exists in the schema, it may be
      // better to modify it than to return a new GraphQLDirective object.
      previousDirective.args.forEach((arg) => {
        if (arg.name === 'level') {
          // Lower the default minimum Role from ADMIN to REVIEWER.
          arg.defaultValue = 'AUTHENTICATED'
        }
      })

      return previousDirective
    }

    // If a previous directive with this name was not found in the schema,
    // there are several options:
    //
    // 1. Construct a new GraphQLDirective (see below).
    // 2. Throw an exception to force the client to declare the directive.
    // 3. Return null, and forget about declaring this directive.
    //
    // All three are valid options, since the visitor will still work without
    // any declared directives. In fact, unless you're publishing a directive
    // implementation for public consumption, you can probably just ignore
    // getDirectiveDeclaration altogether.

    return new GraphQLDirective({
      name: directiveName,
      locations: [DirectiveLocation.OBJECT, DirectiveLocation.FIELD_DEFINITION],
      args: {
        requires: {
          type: new GraphQLList(schema.getType('Acl')),
          defaultValue: ['AUTHENTICATED'],
        },
      },
    })
  }
}

export const resolvers = {
  JSON: GraphQLJSON,
  JSONObject: GraphQLJSONObject,
  Query: {
    getAppUser: (_, { uid }) => {
      return admin.auth().getUser(uid)
    },
    getAppUsers: (_, { limit, pageToken }) => {
      return admin
        .auth()
        .listUsers(limit, pageToken)
        .then((res) => ({
          users: res.users.map((user) => user.toJSON()),
          pageToken: res.pageToken,
        }))
    },
  },
  Mutation: {
    login: (_, { username, password }) =>
      firebase
        .auth()
        .setPersistence(firebase.auth.Auth.Persistence.NONE)
        .then(() =>
          firebase.auth().signInWithEmailAndPassword(username, password),
        )
        .then((credential) => ({
          token: credential.user.getIdToken(),
          refreshToken: credential.user.refreshToken,
          uid: credential.user.uid,
        })),
    verifyToken: (_, { token, checkRevoked }) =>
      admin
        .auth()
        .verifyIdToken(token, !!checkRevoked)
        .then((result) =>
          admin
            .auth()
            .getUser(result.uid)
            .then((user) => user.customClaims),
        ),
    // https://firebase.google.com/docs/reference/rest/auth/
    refreshToken: (_, { token }) =>
      fetch(
        `https://securetoken.googleapis.com/v1/token?key=${client.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `grant_type=refresh_token&refresh_token=${token}`,
        },
      )
        .then((r) => r.json())
        .then((r) => {
          return {
            token: r.access_token,
            refreshToken: r.refresh_token,
            uid: r.user_id,
          }
        }),
    deleteAppUser: (_, { uid }) => {
      return admin
        .auth()
        .deleteUser(uid)
        .then(() => true)
    },
    createAppUser: (_, { user }) => {
      const result = admin.auth().createUser({ ...user })
      if (user.options) {
        result.then((userRecord) => {
          admin
            .auth()
            .setCustomUserClaims(userRecord.uid, user.options)
            .then((_) => admin.auth().getUser(userRecord.uid))
            .then((userRecord) => ({
              ...userRecord,
              options: userRecord.customClaims,
            }))
        })
      }
      return result
    },
    updateAppUser: async (_, { uid, user }) => {
      // обновление user claims сюда же
      // console.log(user);
      if (user?.options) {
        await admin.auth().setCustomUserClaims(uid, user.options)
      }
      return admin.auth().updateUser(uid, user)
    },
  },
  FireBaseUser: {
    options: (user) => user.customClaims,
  },
  LoginResult: {
    options: (result) =>
      admin
        .auth()
        .getUser(result.uid)
        .then((user) => user.customClaims),
  },
}

const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
})

export const adminClient = (
  user = { options: { admin: true } },
): ApolloClient<NormalizedCacheObject> =>
  new ApolloClient({
    cache: new InMemoryCache(),
    link: new SchemaLink({ schema, context: { user } }),
  })

const apolloServer = new ApolloServer({
  schema,
  context: async ({ req }) => {
    // console.log('context');
    const auth = req.headers.authorization
    const token = auth ? auth.match(/Bearer (.*)/)[1] : false
    let user
    if (token) {
      try {
        user = await admin
          .auth()
          .verifyIdToken(token)
          .then((user) => admin.auth().getUser(user.uid))
      } catch (e) {
        console.log('auth', e)
      }
    }
    return { user }
  },
  formatError: (e) => {
    console.log(e)
    if (e.message.match(/firebase/i)) {
      const actualError = e.extensions.exception.errorInfo
      console.log(actualError)
      return new ApolloError(actualError.message, actualError.code)
    } else {
      return e
    }
  },
  schemaDirectives: {
    acl: AclDirective,
  },
})

export const config = {
  api: {
    bodyParser: false,
  },
}

export default apolloServer.createHandler({ path: '/api/admin' })
//https://medium.com/@tomanagle/create-a-server-side-rendering-graphql-client-with-next-js-and-apollo-client-acd397f70c64
