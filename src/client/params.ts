export type GetListParams = {
  pagination?: { page: number; perPage: number }
  sort?: { field: string; order: 'ASC' | 'DESC' }
  filter?: { [key: string]: any }
}

export type idType = string
export type PayloadType = object | any

export type FilterQuery = { [key: string]: any }

export type GetOneParams = {
  id: idType
}

export type CreateParams = {
  data?: PayloadType
}

export type UpdateParams = {
  id: idType
  data?: PayloadType
  previousData?: PayloadType
}

export type UpdateManyParam = {
  ids: Array<idType>
  data: PayloadType
}

export type DeleteParams = {
  id: idType
  previousData?: PayloadType
}

export type DeleteManyParams = {
  ids: Array<idType>
}

export type GetManyParams = {
  ids: Array<idType>
}

export type GetManyReferenceParams = {
  target: string
  id: idType
  pagination?: { page: number; perPage: number }
  sort?: { field: string; order: 'ASC' | 'DESC' }
  filter?: FilterQuery
}
