import { graphqlLodash, filter } from 'gql-lodash'
import { GraphQLRequestContext } from 'apollo-server-types'

export default ({ name = 'lodash' }: { name: string }) => {
  return {
    requestDidStart() {
      return {
        willSendResponse(ctx: GraphQLRequestContext) {
          if (ctx.response.data) {
            const { transform, apply } = graphqlLodash(ctx.document)
            const result = filter(ctx.document, ctx.response.data)
            if (apply) {
              if (ctx.response.extensions) {
                ctx.response.extensions.lodash = transform(result)
              } else {
                ctx.response.extensions = {
                  [name]: transform(result),
                }
              }
            }
          }
        },
      }
    },
  }
}
