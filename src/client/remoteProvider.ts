import ApolloClient from 'apollo-boost'
import gql from 'graphql-tag'
import { set, get, pick, flattenDeep } from 'lodash'
import {} from './params'
import omitDeep from 'omit-deep'
import { ResourceConfig, UploadFile, getImageSize } from './dataProviderV3'
import {
  DataProvider,
  UpdateParams,
  GetListParams,
  DeleteParams,
  GetOneParams,
  GetManyParams,
  UpdateManyParams,
  DeleteManyParams,
  CreateParams,
  GetManyReferenceParams,
} from 'ra-core'
const emptyListResult = {
  data: [],
  total: 0,
}

const emptyResult = {
  data: null,
  total: 0,
}

async function upload(
  fieldName: string,
  submittedData: UpdateManyParams | CreateParams | UpdateParams,
) {
  const data = get(submittedData.data, fieldName)
  if (data) {
    const uploadFileArray = Array.isArray(data)
    const files = (uploadFileArray ? data : [data]).filter((f) => f)

    // const result = data;

    if (uploadFileArray) {
      set(submittedData.data, fieldName, [])
    }

    files
      .filter((f) => !f.rawFile)
      .forEach((f) => {
        if (uploadFileArray) {
          set(submittedData.data, [fieldName, files.indexOf(f)].join('.'), f)
        } else {
          set(submittedData.data, fieldName, f)
        }
      })

    await Promise.all(
      files
        .filter((f) => f.rawFile && f.rawFile)
        .map((f: { rawFile: File }) =>
          convertFileToBase64(f.rawFile).then((file) => {
            const res = {
              name: f.rawFile.name,
              src: file,
              type: 'base64',
            }
            const index = files.indexOf(f)
            uploadFileArray
              ? set(submittedData.data, [fieldName, index].join('.'), res)
              : set(submittedData.data, fieldName, res)
          }),
        ),
    )
    // https://medium.com/@barvysta/firebase-storage-base64url-string-you-are-going-to-have-troubles-40be1ef56521
    //https://stackoverflow.com/questions/47488959/upload-base64-encoded-jpeg-to-firebase-storage-admin-sdk
    // defaultsDeep(submittedData.data, result);
  }
  return submittedData
}

const convertFileToBase64 = (file: File) =>
  new Promise<string | ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)

    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
  })

export default (
  client: ApolloClient<unknown>,
  fragments,
  trackedResources: Array<ResourceConfig>,
): DataProvider => {
  debugger
  const uploads = trackedResources.reduce((res, cur) => {
    res[cur.name] = cur.uploadFields
    return res
  }, {})

  const resourceToTypeName = trackedResources.reduce((res, cur) => {
    res[cur.path] = cur.name
    return res
  }, {})

  const saveFilter = trackedResources.reduce((res, cur) => {
    res[cur.name] =
      Object.keys(cur.saveFilter).length === 0
        ? (data) => data
        : (data) => pick(data, Object.keys(cur.saveFilter))
    return res
  }, {})

  const prepareFiles = async (resource, data) => {
    uploads[resource].length > 0
      ? await Promise.all(uploads[resource].map((f) => upload(f, data)))
      : data
    return data
  }

  return {
    getList: async (resource: string, params: GetListParams) =>
      client
        .query({
          query: gql` query getList${
            resourceToTypeName[resource]
          } ($pagination: Pagination, $sort: Sort, $filter: JSON) {
            getList${
              resourceToTypeName[resource]
            }(pagination: $pagination, sort: $sort, filter: $filter){
              data {
                ...Query${resourceToTypeName[resource]}
              }
              total
            }
          }
          ${fragments[resourceToTypeName[resource]].query(fragments)}
          `,
          variables: omitDeep(params, '__typename'),
          fetchPolicy: 'network-only',
        })
        .then((r) => ({ ...r.data[`getList${resourceToTypeName[resource]}`] })),
    getOne: (resource: string, params: GetOneParams) =>
      client
        .query({
          query: gql` query getOne${resourceToTypeName[resource]} ($id: ID!) {
                getOne${resourceToTypeName[resource]}(id: $id){
                  data{
                  ...Query${resourceToTypeName[resource]}
                  }
                }
              }
              ${fragments[resourceToTypeName[resource]].query(fragments)}
              `,
          variables: omitDeep(params, '__typename'),
          fetchPolicy: 'network-only',
        })
        .then((r) => ({ ...r.data[`getOne${resourceToTypeName[resource]}`] })),
    getMany: (resource: string, params: GetManyParams) =>
      client
        .query({
          query: gql` query getMany${
            resourceToTypeName[resource]
          } ($ids: [ID!]!) {
                getMany${resourceToTypeName[resource]}(ids: $ids){
                  data {
                  ...Query${resourceToTypeName[resource]}
                  }
                }
              }
              ${fragments[resourceToTypeName[resource]].query(fragments)}
              `,
          variables: omitDeep(
            { ...params, ids: flattenDeep(params.ids) },
            '__typename',
          ),
          fetchPolicy: 'network-only',
        })
        .then((r) => ({ ...r.data[`getMany${resourceToTypeName[resource]}`] })),
    getManyReference: (resource: string, params: GetManyReferenceParams) =>
      client
        .query({
          query: gql` query getManyReference${
            resourceToTypeName[resource]
          } ($target: String, $id: ID, $pagination: Pagination, $sort: Sort, $filter: JSON) {
                getManyReference${
                  resourceToTypeName[resource]
                }(target: $target, id: $id, pagination: $pagination, sort: $sort, filter: $filter){
                  data {
                    ...Query${resourceToTypeName[resource]}
                  }
                  total
                }
              }
              ${fragments[resourceToTypeName[resource]].query(fragments)}
              `,
          variables: omitDeep(params, '__typename'),
          fetchPolicy: 'network-only',
        })
        .then((r) => ({
          ...r.data[`getManyReference${resourceToTypeName[resource]}`],
        })),
    create: (resource: string, params: CreateParams) =>
      client
        .mutate({
          mutation: gql` mutation create${
            resourceToTypeName[resource]
          } ($data: ${resourceToTypeName[resource]}Create!) {
                create${resourceToTypeName[resource]}(data: $data){
                  data {
                  ...Query${resourceToTypeName[resource]}
                  }
                }
              }
              ${fragments[resourceToTypeName[resource]].query(fragments)}
              `,
          variables: omitDeep(
            {
              ...params,
              data: saveFilter[resourceToTypeName[resource]](params.data),
            },
            '__typename',
          ),
        })
        .then((r) => ({ ...r.data[`create${resourceToTypeName[resource]}`] })),
    // update можно делать patch
    update: async (resource: string, params: UpdateParams) =>
      client
        .mutate({
          mutation: gql` mutation update${
            resourceToTypeName[resource]
          } ($id: ID!, $data: ${
            resourceToTypeName[resource]
          }Update!, $previousData: ${resourceToTypeName[resource]}Update!) {
                update${
                  resourceToTypeName[resource]
                }(id:$id, data: $data, previousData: $previousData){
                  data {
                  ...Query${resourceToTypeName[resource]}
                  }
                }
              }
              ${fragments[resourceToTypeName[resource]].query(fragments)}
              `,
          variables: omitDeep(
            {
              ...params,
              data: saveFilter[resourceToTypeName[resource]](params.data),
              previousData: saveFilter[resourceToTypeName[resource]](
                params.previousData,
              ),
            },
            '__typename',
          ),
        })
        .then((r) => ({ ...r.data[`update${resourceToTypeName[resource]}`] })),
    updateMany: async (resource: string, params: UpdateManyParams) =>
      client
        .mutate({
          mutation: gql` mutation updateMany${
            resourceToTypeName[resource]
          } ($data: ${resourceToTypeName[resource]}Update!) {
                updateMany${resourceToTypeName[resource]}(data: $data){
                  data
                }
              }
              ${fragments[resourceToTypeName[resource]].query(fragments)}
              `,
          variables: await prepareFiles(
            resource,
            omitDeep(
              {
                ...params,
                data: saveFilter[resourceToTypeName[resource]](params.data),
              },
              '__typename',
            ),
          ),
        })
        .then((r) => ({
          ...r.data[`updateMany${resourceToTypeName[resource]}`],
        })),
    delete: async (resource: string, params: DeleteParams) =>
      client
        .mutate({
          mutation: gql` mutation delete${
            resourceToTypeName[resource]
          } ($id: ID!, $previousData: ${resourceToTypeName[resource]}Update!) {
                delete${
                  resourceToTypeName[resource]
                }(id: $id, previousData: $previousData){
                  data {
                  ...Query${resourceToTypeName[resource]}
                  }
                }
              }
              ${fragments[resourceToTypeName[resource]].query(fragments)}
              `,
          variables: await prepareFiles(resource, { id: params.id }),
        })
        .then((r) => ({ ...r.data[`delete${resourceToTypeName[resource]}`] })),
    deleteMany: (resource: string, params: DeleteManyParams) =>
      client
        .mutate({
          mutation: gql` mutation deleteMany${resourceToTypeName[resource]} ($ids: [ID!]!) {
                deleteMany${resourceToTypeName[resource]}(ids: $ids){
                  data
                }
              }
              `,
          variables: omitDeep(params, '__typename'),
        })
        .then((r) => ({
          ...r.data[`deleteMany${resourceToTypeName[resource]}`],
        })),
  }
}
