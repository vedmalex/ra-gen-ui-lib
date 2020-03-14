import { defaultsDeep, pick, mapKeys } from 'lodash'
import {
  GetOneParams,
  DeleteParams,
  CreateParams,
  DeleteManyParams,
  idType,
  GetListParams,
  GetManyParams,
  GetManyReferenceParams,
  UpdateParams,
  UpdateManyParam,
} from './params'
import sortBy from 'sort-by'
import debug from 'debug'
import { sliceArray, filterQuery, makeFilter } from './filter'
import { getDiffObject } from './diffObject'

const log = debug('ra-data-firestore')

export interface ResourceConfig {
  name: string
  path: string
  filter?: JSON
  isPublic?: boolean
  uploadFields: Array<string>
  collections?: Array<string | ResourceConfig>
  maps?: Array<string | ResourceConfig>
  saveFilter: { [name: string]: string }
  readFilter?: { [name: string]: string }
}

export type ImageSize = {
  width: any
  height: any
}

export function getImageSize(file) {
  return new Promise<ImageSize>((resolve) => {
    const img = document.createElement('img')
    img.onload = function() {
      resolve({
        width: (this as HTMLImageElement).width,
        height: (this as HTMLImageElement).height,
      })
    }
    img.src = file.src
  })
}

export type UploadFile = {
  uploadedAt: number
  src: string
  type: string
  md5Hash: string
  path: string
  name: string
} & Partial<ImageSize>

export interface StoreData {
  id?: idType
}

export interface dataProviderConfig {
  firestore: firebase.firestore.Firestore
  trackedResources: Array<ResourceConfig>
}

type SubCollectionPayload = {
  name: string
  data: Array<StoreData>
}

export default class {
  firestore: firebase.firestore.Firestore
  trackedResources: Array<ResourceConfig>
  trackedResourcesIndex: { [resource: string]: number }
  resourcesPaths: { [resource: string]: string }
  resourcesUploadFields: { [resource: string]: Array<string> }
  readMapper: { [resource: string]: (object) => any }
  writeMapper: { [resource: string]: (object) => any }

  firebaseGetFilter<T>(data: T, resource: string) {
    const config = this.trackedResources[this.trackedResourcesIndex[resource]]
    if (config.filter) {
      return {
        ...this.readMapper[resource](data),
        ...config.filter,
      }
    } else {
      return this.readMapper[resource](data)
    }
  }

  firebaseSaveFilter<T>(data: T, resource: string) {
    const config = this.trackedResources[this.trackedResourcesIndex[resource]]
    if (config.filter) {
      return {
        ...this.writeMapper[resource](data),
        ...config.filter,
      }
    } else {
      return this.writeMapper[resource](data)
    }
  }

  dataProvider() {
    const dataProvider = {
      getList: this.getList.bind(this),
      getOne: this.getOne.bind(this),
      getMany: this.getMany.bind(this),
      getManyReference: this.getManyReference.bind(this),
      create: this.create.bind(this),
      update: this.update.bind(this),
      updateMany: this.updateMany.bind(this),
      delete: this.delete.bind(this),
      deleteMany: this.deleteMany.bind(this),
    }
    return dataProvider
  }
  constructor({ firestore, trackedResources }: dataProviderConfig) {
    this.firestore = firestore

    this.trackedResources = trackedResources

    this.trackedResourcesIndex = {}

    this.resourcesPaths = {}
    this.resourcesUploadFields = {}

    // Sanitize Resources
    trackedResources.map((resource, index) => {
      if (typeof resource === 'string') {
        resource = {
          name: resource,
          path: resource,
          uploadFields: [],
          saveFilter: {},
          readFilter: {},
        }
        trackedResources[index] = resource
      } else {
        defaultsDeep(resource, {
          name: resource.name || resource.path,
          path: resource.path || resource.name,
          uploadFields: [],
          readFilter: Object.keys(resource.saveFilter).reduce((res, cur) => {
            res[resource.saveFilter[cur]] = cur
            return res
          }, {}),
        })
      }
      const { name, path, uploadFields } = resource
      this.trackedResourcesIndex[name] = index
      this.resourcesUploadFields[name] = uploadFields || []
      this.resourcesPaths[name] = path || name
    })

    this.writeMapper = this.trackedResources.reduce((res, cur) => {
      res[cur.name] =
        Object.keys(cur.saveFilter).length === 0
          ? (data) => data
          : (data) => {
              const res = pick(data, Object.keys(cur.saveFilter))
              return mapKeys(res, (_, key) => {
                return cur.saveFilter[key]
              })
            }
      return res
    }, {})

    this.readMapper = this.trackedResources.reduce((res, cur) => {
      res[cur.name] =
        Object.keys(cur.readFilter).length === 0
          ? (data) => data
          : (data) => {
              const res = pick(data, Object.keys(cur.readFilter))
              return mapKeys(res, (_, key) => {
                return cur.readFilter[key]
              })
            }
      return res
    }, {})
  }

  async upload(
    fieldName: string,
    submittedData: object,
    previousData: object,
    id: string,
    resource: string,
  ): Promise<object> {
    throw new Error('not implemented')
  }

  async _subCollection(
    doc: firebase.firestore.DocumentReference,
    payload: SubCollectionPayload,
  ) {
    const batch = this.firestore.batch()
    const collection = doc.collection(payload.name)
    const alreadyHas = await collection.get()

    const currentIds = payload.data.map((d) => d.id)
    const allDocs = alreadyHas.docs
      .map((d) => (d.exists ? d.data() : undefined))
      .filter((f) => f)
      .reduce((res, doc) => {
        res[doc.id] = doc
        return res
      }, {}) as {
      [key: string]: firebase.firestore.DocumentData
    }

    const currentDocs = payload.data.reduce((result, cur) => {
      result[cur.id] = cur
      return result
    }, {})

    const allIds = Object.keys(allDocs)

    const toDelete = Object.keys(allDocs).filter(
      (key) => currentIds.indexOf(key) > -1,
    )

    if (toDelete.length > 0) {
      toDelete.map((id) => collection.doc(id)).map((doc) => batch.delete(doc))
    }

    const toInsert = currentIds.filter((id) => allIds.indexOf(id) == -1)
    if (toInsert.length > 0) {
      toInsert.map((id) => {
        const doc = collection.doc(id)
        batch.set(doc, currentDocs[id])
      })
    }
    const toUpdate = currentIds.filter((id) => allIds.indexOf(id) > -1)
    if (toUpdate.length > 0) {
      toUpdate.map((id) => {
        const doc = collection.doc(id)
        batch.set(doc, currentDocs[id])
      })
    }

    await batch.commit()
  }

  async delete(resource: string, params?: DeleteParams): Promise<object> {
    const id = params?.id
    const resourcePath = this.resourcesPaths[resource]
    await this.firestore
      .collection(resourcePath)
      .doc(id)
      .delete()
    return { data: params.previousData || { id } }
  }
  _getItemID(resource: string, params: any) {
    let itemId = params.data.id || params.id
    if (!itemId) {
      itemId = this.firestore.collection(this.resourcesPaths[resource]).doc().id
    }
    return itemId
  }
  async getOne(resource: string, params: GetOneParams) {
    if (params.id) {
      const result = await this.firestore
        .collection(this.resourcesPaths[resource])
        .doc(params.id.toString())
        .get()

      if (result.exists) {
        const data = result.data()

        if (data && data.id == null) {
          data['id'] = result.id
        }
        return {
          data: this.firebaseGetFilter(data, resource),
        }
      } else {
        throw new Error('Id not found')
      }
    } else {
      throw new Error('Key not found')
    }
  }

  async getMany(resource: string, params: GetManyParams) {
    debugger
    const data = []
    for await (const items of sliceArray(params.ids, 10)) {
      data.push(
        ...(
          await this.firestore
            .collection(this.resourcesPaths[resource])
            .where('id', 'in', items)
            .get()
        ).docs.map((d) => d.data()),
      )
    }
    return {
      data: data.map((d) => this.firebaseGetFilter(d, resource)),
    }
  }

  async getManyReference(resource: string, params: GetManyReferenceParams) {
    if (params?.target) {
      if (!params.filter) params.filter = {}
      params.filter[params.target] = params?.id
      return this.getList(resource, params)
    } else {
      throw new Error('Error processing request')
    }
  }

  async getListNative(resource: string, params: GetListParams) {
    const resourceConfig = this.trackedResources[
      this.trackedResourcesIndex[resource]
    ]
    let query: any = this.firestore.collection(this.resourcesPaths[resource])

    if (params?.sort?.field || params?.sort?.order) {
      query = query.orderBy(
        params?.sort?.field,
        params?.sort?.order == 'ASC' ? 'asc' : 'desc',
      )
    }

    if (resourceConfig.filter) {
      if (params?.filter) {
        query = filterQuery(query, {
          ...params.filter,
          ...resourceConfig.filter,
        })
      } else {
        query = filterQuery(query, resourceConfig.filter)
      }
    } else {
      if (params?.filter) {
        query = filterQuery(query, params.filter)
      }
    }

    const snapshots = await query.get()

    const values = snapshots.docs.map((s) => s.data())

    const { page, perPage } = params?.pagination || { page: 0, perPage: 0 }
    const _start = (page - 1) * perPage
    const _end = page * perPage
    const data =
      values && _start && _end
        ? values.slice(_start, _end)
        : values
        ? values
        : []
    const total = values ? values.length : 0
    return {
      data: data.map((d) => this.firebaseGetFilter(d, resource)),
      total,
    }
  }

  async getList(resource, params: GetListParams) {
    const snapshots = await this.firestore
      .collection(this.resourcesPaths[resource])
      .get()

    const result = snapshots.docs.map((s) => s.data())
    const resourceConfig = this.trackedResources[
      this.trackedResourcesIndex[resource]
    ]
    let filter
    if (resourceConfig.filter) {
      if (params?.filter) {
        filter = { ...resourceConfig.filter, ...params?.filter }
      } else {
        filter = resourceConfig.filter
      }
    } else {
      if (params?.filter) {
        filter = params.filter
      }
    }

    const values: Array<any> = filter
      ? result.filter(makeFilter(filter))
      : result

    if (params?.sort) {
      values.sort(
        sortBy(`${params.sort.order === 'ASC' ? '-' : ''}${params.sort.field}`),
      )
    }
    const { page, perPage } = params?.pagination || { page: 1, perPage: 10 }
    const _start = (page - 1) * perPage
    const _end = page * perPage
    const data = values ? values.slice(_start, _end) : []
    const total = values ? values.length : 0

    return {
      data: data.map((d) => this.firebaseGetFilter(d, resource)),
      total,
    }
  }

  async create(resource: string, params: CreateParams) {
    const itemId = this._getItemID(resource, params)

    const uploads = this.resourcesUploadFields[resource]
      ? this.resourcesUploadFields[resource].map((field) =>
          this.upload(field, params?.data, {}, itemId, resource),
        )
      : []

    const uploadResults = await Promise.all(uploads)

    const data = this.firebaseSaveFilter(
      { ...params.data, ...uploadResults },
      resource,
    )
    await this.firestore
      .collection(this.resourcesPaths[resource])
      .doc(itemId)
      .set({ ...data, id: itemId })

    const result = await this.firestore
      .collection(this.resourcesPaths[resource])
      .doc(itemId)
      .get()

    if (result.exists) {
      const data = result.data()
      return { data: { ...this.firebaseGetFilter(data, resource), id: itemId } }
    } else {
      throw new Error('creating document problem')
    }
  }

  async update(resource: string, params: UpdateParams) {
    const itemId = this._getItemID(resource, params)

    const item = await this.firestore
      .collection(this.resourcesPaths[resource])
      .doc(itemId)
      .get()

    const currentData = item.exists ? { ...item.data(), id: item.id } : {}
    const data =
      item.exists && params.previousData
        ? getDiffObject(params.previousData, params.data) ?? currentData
        : params.data

    const uploads = this.resourcesUploadFields[resource]
      ? this.resourcesUploadFields[resource].map((field) =>
          this.upload(field, data, currentData, itemId, resource),
        )
      : []

    const uploadResults = await Promise.all(uploads)

    const update = {
      ...data,
      ...uploadResults,
    }

    if (item.exists) {
      await this.firestore
        .collection(this.resourcesPaths[resource])
        .doc(itemId)
        .update(update)
    } else {
      await this.firestore
        .collection(this.resourcesPaths[resource])
        .doc(itemId)
        .set(update)
    }

    const result = await this.firestore
      .collection(this.resourcesPaths[resource])
      .doc(itemId)
      .get()

    if (result.exists) {
      const data = result.data()
      return { data: { ...this.firebaseGetFilter(data, resource), id: itemId } }
    } else {
      throw new Error('saving document problem')
    }
  }

  async updateMany(resource: string, params: UpdateManyParam) {
    const updateParams = params?.ids.map((id) => ({
      id,
      data: params.data,
    }))
    const data = await Promise.all(
      updateParams.map((p) => this.update(resource, p)),
    ).then((r) => r.map((d) => d.data.id))
    const result = { data }
    log('updateMany %s %j %j', resource, params, result)
    return result
  }

  async deleteMany(resource: string, params: DeleteManyParams) {
    const delParams = params?.ids.map((id) => ({
      id,
    }))
    const data = (
      await Promise.all(delParams.map((p) => this.delete(resource, p)))
    ).map((r: { data: { id: any } }) => r.data.id)
    const result = { data }
    log('deleteMany %s %j %j', resource, params, result)
    return result
  }
}
