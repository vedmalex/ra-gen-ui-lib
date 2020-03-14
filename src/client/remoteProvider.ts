import ApolloClient from 'apollo-boost'
import gql from 'graphql-tag'
import { set, get, pick, flattenDeep } from 'lodash'
import {
  GetListParams,
  GetOneParams,
  GetManyParams,
  GetManyReferenceParams,
  UpdateParams,
  UpdateManyParam,
  DeleteParams,
  DeleteManyParams,
  CreateParams,
} from './params'
import * as omitDeep from 'omit-deep'
import { ResourceConfig, UploadFile, getImageSize } from './dataProviderV3'

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
  submittedData: UpdateManyParam | CreateParams | UpdateParams,
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
) => {
  const uploads = trackedResources.reduce((res, cur) => {
    res[cur.name] = cur.uploadFields
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
    getList: (resource: string, params: GetListParams) =>
      client
        .query({
          query: gql` query getList${resource} ($pagination: Pagination, $sort: Sort, $filter: JSON) {
            getList${resource}(pagination: $pagination, sort: $sort, filter: $filter){
              data {
                ...Query${resource}
              }
              total
            }
          }
          ${fragments[resource].query(fragments)}
          `,
          variables: omitDeep(params, '__typename'),
          fetchPolicy: 'network-only',
        })
        .then((r) => r.data[`getList${resource}`]),
    getOne: (resource: string, params: GetOneParams) =>
      params?.id
        ? client
            .query({
              query: gql` query getOne${resource} ($id: ID!) {
                getOne${resource}(id: $id){
                  data{
                  ...Query${resource}
                  }
                }
              }
              ${fragments[resource].query(fragments)}
              `,
              variables: omitDeep(params, '__typename'),
              fetchPolicy: 'network-only',
            })
            .then((r) => r.data[`getOne${resource}`])
        : Promise.resolve(emptyResult),
    getMany: (resource: string, params: GetManyParams) =>
      params?.ids?.length > 0
        ? client
            .query({
              query: gql` query getMany${resource} ($ids: [ID!]!) {
                getMany${resource}(ids: $ids){
                  data {
                  ...Query${resource}
                  }
                }
              }
              ${fragments[resource].query(fragments)}
              `,
              variables: omitDeep(
                { ...params, ids: flattenDeep(params.ids) },
                '__typename',
              ),
              fetchPolicy: 'network-only',
            })
            .then((r) => r.data[`getMany${resource}`])
        : Promise.resolve(emptyListResult),
    getManyReference: (resource: string, params: GetManyReferenceParams) =>
      params?.id
        ? client
            .query({
              query: gql` query getManyReference${resource} ($target: String, $id: ID, $pagination: Pagination, $sort: Sort, $filter: JSON) {
                getManyReference${resource}(target: $target, id: $id, pagination: $pagination, sort: $sort, filter: $filter){
                  data {
                    ...Query${resource}
                  }
                  total
                }
              }
              ${fragments[resource].query(fragments)}
              `,
              variables: omitDeep(params, '__typename'),
              fetchPolicy: 'network-only',
            })
            .then((r) => r.data[`getManyReference${resource}`])
        : Promise.resolve(emptyListResult),
    create: (resource: string, params: CreateParams) =>
      params?.data
        ? client
            .mutate({
              mutation: gql` mutation create${resource} ($data: ${resource}Create!) {
                create${resource}(data: $data){
                  data {
                  ...Query${resource}
                  }
                }
              }
              ${fragments[resource].query(fragments)}
              `,
              variables: omitDeep(
                {
                  ...params,
                  data: saveFilter[resource](params.data),
                },
                '__typename',
              ),
            })
            .then((r) => r.data[`create${resource}`])
        : Promise.resolve(emptyResult),
    // update можно делать patch
    update: async (resource: string, params: UpdateParams) => {
      // params.data = diff(params.data, params.previousData);
      return params?.id && params?.data
        ? client
            .mutate({
              mutation: gql` mutation update${resource} ($id: ID!, $data: ${resource}Update!, $previousData: ${resource}Update!) {
                update${resource}(id:$id, data: $data, previousData: $previousData){
                  data {
                  ...Query${resource}
                  }
                }
              }
              ${fragments[resource].query(fragments)}
              `,
              variables: omitDeep(
                {
                  ...params,
                  data: saveFilter[resource](params.data),
                  previousData: saveFilter[resource](params.previousData),
                },
                '__typename',
              ),
            })
            .then((r) => r.data[`update${resource}`])
        : Promise.resolve(emptyResult)
    },
    updateMany: async (resource: string, params: UpdateManyParam) =>
      params?.ids && params?.data
        ? client
            .mutate({
              mutation: gql` mutation updateMany${resource} ($data: ${resource}Update!) {
                updateMany${resource}(data: $data){
                  data
                }
              }
              ${fragments[resource].query(fragments)}
              `,
              variables: await prepareFiles(
                resource,
                omitDeep(
                  {
                    ...params,
                    data: saveFilter[resource](params.data),
                  },
                  '__typename',
                ),
              ),
            })
            .then((r) => r.data[`updateMany${resource}`])
        : Promise.resolve(emptyListResult),
    delete: async (resource: string, params: DeleteParams) =>
      params?.id
        ? client
            .mutate({
              mutation: gql` mutation delete${resource} ($id: ID!, $previousData: ${resource}Update!) {
                delete${resource}(id: $id, previousData: $previousData){
                  data {
                  ...Query${resource}
                  }
                }
              }
              ${fragments[resource].query(fragments)}
              `,
              variables: await prepareFiles(
                resource,
                omitDeep(
                  {
                    ...params,
                    previousData: saveFilter[resource](params.previousData),
                  },
                  '__typename',
                ),
              ),
            })
            .then((r) => r.data[`delete${resource}`])
        : Promise.resolve(emptyResult),
    deleteMany: (resource: string, params: DeleteManyParams) =>
      params?.ids
        ? client
            .mutate({
              mutation: gql` mutation deleteMany${resource} ($ids: [ID!]!) {
                deleteMany${resource}(ids: $ids){
                  data
                }
              }
              `,
              variables: omitDeep(params, '__typename'),
            })
            .then((r) => r.data[`deleteMany${resource}`])
        : Promise.resolve(emptyListResult),
  }
}
