import {
  Schema,
  Scalar,
  Enum,
  Directive,
  Type,
  Input,
  Query,
  Mutation,
} from 'gql-schema-builder'
import { AuthenticationError } from 'apollo-server-micro'
import gql from 'graphql-tag'
import {
  SchemaDirectiveVisitor,
  VisitableSchemaType,
} from 'graphql-tools/dist/schemaVisitor'
import { GraphQLSchema } from 'graphql'
import GraphQLJSON, { GraphQLJSONObject } from 'graphql-type-json'
import { union } from 'lodash'
import {
  GraphQLList,
  GraphQLString,
  GraphQLDirective,
  DirectiveLocation,
  defaultFieldResolver,
} from 'graphql'

export const ID = new Scalar({
  schema: gql`
    scalar ID
  `,
  // resolver: GraphQLString,
})
export const UID = new Scalar({
  schema: gql`
    scalar UID
  `,
  // resolver: GraphQLString,
})
export const DateSchema = new Scalar({
  schema: gql`
    scalar Date
  `,
  // resolver: GraphQLString,
})
export const Url = new Scalar({
  schema: gql`
    scalar Url
  `,
  // resolver: GraphQLString,
})
export const Token = new Scalar({
  schema: gql`
    scalar Token
  `,
  // resolver: GraphQLString,
})
export const JSONScalar = new Scalar({
  schema: gql`
    scalar JSON
  `,
  resolver: GraphQLJSON,
})

export const JSONObjectScalar = new Scalar({
  schema: gql`
    scalar JSONObject
  `,
  resolver: GraphQLJSONObject,
})

export const Acl = new Enum(gql`
  enum Acl {
    AUTHENTICATED
    ADMIN
  }
`)

export const acl = new Directive(
  gql`
    directive @acl(level: [Acl] = [AUTHENTICATED]) on OBJECT | FIELD_DEFINITION
  `,
)

export const storage = new Directive(gql`
  directive @storage(
    identity: Boolean
    indexed: Boolean
    calculated: Boolean
  ) on FIELD_DEFINITION
`)

export const entry = new Directive(gql`
  directive @entry(calculated: Boolean) on OBJECT
`)

export const RelationType = new Enum(gql`
  enum RelationType {
    BTM
    BTO
    HM
    HO
  }
`)

export const relation = new Directive(gql`
  directive @relation(
    type: RelationType
    to: String
    from: String
    using: String
  ) on FIELD_DEFINITION
`)

export const UI = new Directive(gql`
  directive @UI(
    title: String
    titlePlural: String
    hint: String
    generalTab: String
    listName: String
    list: Boolean
    edit: Boolean
  ) on OBJECT | FIELD_DEFINITION
`)

export const UserClaim = new Type(gql`
  type UserClaim {
    admin: Boolean
    student: Boolean
    capitan: Boolean
    curator: Boolean
    owner: Boolean
  }
`)

export const UserClaimInput = new Input(gql`
  input UserClaimInput {
    admin: Boolean
    student: Boolean
    capitan: Boolean
    curator: Boolean
    owner: Boolean
  }
`)

export const FireBaseUserInfo = new Type(gql`
  type FireBaseUserInfo {
    displayName: String
    email: String
    phoneNumber: String
    photoURL: Url
    providerId: ID
    uid: UID
  }
`)

export const FireBaseUserMetadata = new Type(gql`
  type FireBaseUserMetadata {
    creationTime: String
    lastSignInTime: String
  }
`)

export const FireBaseUser = new Type({
  schema: gql`
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
  `,
  resolver: {
    options: (user) => user.customClaims,
  },
})

export const FirebaseUserCreate = new Input(
  gql`
    input FirebaseUserCreate {
      # The uid to assign to the newly created user.Must be a string between 1 and 128 characters long, inclusive.If not provided, a random uid will be automatically generated.
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
      # Whether or not the user is disabled.true for disabled; false for enabled.If not provided, the default is false.
      disabled: Boolean
      claims: UserClaimInput
    }
  `,
)

export const FirebaseUserUpdate = new Input(
  gql`
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
      # Whether or not the user is disabled.true for disabled; false for enabled.If not provided, the default is false.
      disabled: Boolean
      claims: UserClaimInput
    }
  `,
)

export const AppUserList = new Type(
  gql`
    type AppUserList {
      users: [FireBaseUser]
      pageToken: String
    }
  `,
)

export const getAppUser = new Query({
  schema: gql`
    extend type Query {
      getAppUser(uid: UID): FireBaseUser @acl(level: ADMIN)
    }
  `,
  resolver: (_, { uid }, { admin }) => {
    return admin.auth().getUser(uid)
  },
})

export const getAppUsers = new Query({
  schema: gql`
    extend type Query {
      getAppUsers(limit: Int, pageToken: String): AppUserList @acl(level: ADMIN)
    }
  `,
  resolver: (_, { limit, pageToken }, { admin }) => {
    return admin
      .auth()
      .listUsers(limit, pageToken)
      .then((res) => ({
        users: res.users.map((user) => user.toJSON()),
        pageToken: res.pageToken,
      }))
  },
})

export const LoginResult = new Type({
  schema: gql`
    type LoginResult {
      token: Token!
      refreshToken: Token!
      uid: ID!
      options: UserClaim
    }
  `,
  resolver: {
    options: (result, _, { admin }) =>
      admin
        .auth()
        .getUser(result.uid)
        .then((user) => user.customClaims),
  },
})

export const login = new Mutation({
  schema: gql`
    extend type Mutation {
      login(username: String, password: String): LoginResult
    }
  `,
  resolver: (_, { username, password }, { firebase }) =>
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
})

export const refreshToken = new Mutation({
  schema: gql`
    extend type Mutation {
      refreshToken(token: Token): LoginResult @acl
    }
  `,
  // https://firebase.google.com/docs/reference/rest/auth/
  resolver: (_, { token }, { fetch, client }) =>
    fetch(`https://securetoken.googleapis.com/v1/token?key=${client.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${token}`,
    })
      .then((r) => r.json())
      .then((r) => {
        console.log(r)
        return {
          token: r.access_token,
          refreshToken: r.refresh_token,
          uid: r.user_id,
        }
      }),
})

export const verifyToken = new Mutation({
  schema: gql`
    extend type Mutation {
      verifyToken(
        token: Token
        refreshToken: Token
        checkRevoked: Boolean
      ): UserClaim
    }
  `,
  resolver: (_, { token, checkRevoked }, { admin }) =>
    admin
      .auth()
      .verifyIdToken(token, !!checkRevoked)
      .then((result) =>
        admin
          .auth()
          .getUser(result.uid)
          .then((user) => user.customClaims),
      ),
})

export const deleteAppUser = new Mutation({
  schema: gql`
    extend type Mutation {
      deleteAppUser(uid: UID): Boolean @acl(level: ADMIN)
    }
  `,
  resolver: (_, { uid }, { admin }) => {
    return admin
      .auth()
      .deleteUser(uid)
      .then(() => true)
  },
})

export const createAppUser = new Mutation({
  schema: gql`
    extend type Mutation {
      createAppUser(user: FirebaseUserCreate): FireBaseUser @acl(level: ADMIN)
    }
  `,
  resolver: (_, { user }, { admin }) => {
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
})
export const updateAppUser = new Mutation({
  schema: gql`
    extend type Mutation {
      updateAppUser(uid: UID, user: FirebaseUserUpdate): FireBaseUser
        @acl(level: ADMIN)
    }
  `,
  resolver: async (_, { uid, user }, { admin }) => {
    // обновление user claims сюда же
    // console.log(user);
    if (user?.options) {
      await admin.auth().setCustomUserClaims(uid, user.options)
    }
    return admin.auth().updateUser(uid, user)
  },
})

export const FirebaseAdmin = new Schema({
  name: 'firebase-admin',
  items: [
    ID,
    UID,
    DateSchema,
    Url,
    Token,
    JSONScalar,
    JSONObjectScalar,
    Acl,
    acl,
    storage,
    RelationType,
    entry,
    relation,
    UI,
    UserClaim,
    UserClaimInput,
    FireBaseUserInfo,
    FireBaseUserMetadata,
    FireBaseUser,
    FirebaseUserCreate,
    FirebaseUserUpdate,
    AppUserList,
    getAppUser,
    getAppUsers,
    LoginResult,
    login,
    refreshToken,
    verifyToken,
    deleteAppUser,
    createAppUser,
    updateAppUser,
  ],
})

export class AclDirective extends SchemaDirectiveVisitor {
  // checkPermissions: (
  //   permissions: Array<string>,
  //   context: {
  //     [key: string]: any
  //   },
  // ) => boolean
  visitObject(type) {
    type._acl = this.args?.level
      ? Array.isArray(this.args.level)
        ? this.args.level
        : [this.args.level]
      : ['AUTHENTICATED']
    this.ensureWrapped(type)
  }
  visitFieldDefinition(field, details) {
    field._acl = this.args?.level
      ? Array.isArray(this.args.level)
        ? this.args.level
        : [this.args.level]
      : ['AUTHENTICATED']
    this.ensureWrapped(details.objectType)
  }
  ensureWrapped(objectType) {
    if (objectType._aclwrap == true) return
    objectType._aclwrap = true
    const fields = objectType.getFields()
    Object.keys(fields).forEach((fieldName) => {
      const field = fields[fieldName]
      const { resolve = defaultFieldResolver } = field
      field.resolve = async (...args) => {
        const objectAcl = objectType._acl
          ? Array.isArray(objectType._acl)
            ? objectType._acl
            : [objectType._acl]
          : []
        const fieldAcl: Array<string> = field._acl
          ? Array.isArray(field._acl)
            ? field._acl
            : [field._acl]
          : []
        const acl = union(objectAcl, fieldAcl)
        const context = args[2]
        try {
          const allowed = context.checkPermissions(acl, context)
          if (!allowed) throw new AuthenticationError('not allowed to access')
        } catch (e) {
          throw e
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
          arg.defaultValue = ['AUTHENTICATED']
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
