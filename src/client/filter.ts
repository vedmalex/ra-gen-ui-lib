import { set } from 'lodash'

function deep(data: any, reg: RegExp) {
  return (
    data &&
    typeof data === 'object' &&
    Object.keys(data).some((f) =>
      data[f] && typeof data[f] !== 'object'
        ? reg.test(data[f].toString())
        : deep(data[f], reg),
    )
  )
}

export class FilterData {
  public static operations = {
    eq(value, id) {
      if (value instanceof Date) {
        return `value ? (value.valueOf == ${value.valueOf()}) : false`
      } else {
        return `value ? (value${id ? '.toString()' : ''} == ${JSON.stringify(
          value,
        )}) : false`
      }
    },
    size(value) {
      if (value) {
        return `value ? (value.length === ${value}) : false`
      }
    },
    gt(value, id) {
      if (value instanceof Date) {
        return `value ? (value.valueOf > ${value.valueOf()}) : false`
      } else {
        return `value ?( value${id ? '.toString()' : ''} > ${JSON.stringify(
          value,
        )}) : false`
      }
    },
    gte(value, id) {
      if (value instanceof Date) {
        return `value ? (value.valueOf >= ${value.valueOf()}) : false`
      } else {
        return `value ? (value${id ? '.toString()' : ''} >= ${JSON.stringify(
          value,
        )}) : false`
      }
    },
    lt(value, id) {
      if (value instanceof Date) {
        return `value ? (value.valueOf < ${value.valueOf()}) : false`
      } else {
        return `value ? (value${id ? '.toString()' : ''} < ${JSON.stringify(
          value,
        )}) : false`
      }
    },
    lte(value, id) {
      if (value instanceof Date) {
        return `value ? (value.valueOf <= ${value.valueOf()}) : false`
      } else {
        return `value ? (value${id ? '.toString()' : ''} <= ${JSON.stringify(
          value,
        )}) : false`
      }
    },
    ne(value, id) {
      if (value instanceof Date) {
        return `value ? (value.valueOf !== ${value.valueOf()}) : false`
      } else {
        return `value ? (value${id ? '.toString()' : ''} !== ${JSON.stringify(
          value,
        )}) : false`
      }
    },
    in(value, id) {
      if (value[0] instanceof Date) {
        return `value ? (${JSON.stringify(
          value.map((v) => v.valueOf()),
        )}.indexOf(value) !== -1) : false`
      } else {
        return `value ? (${JSON.stringify(value)}.indexOf(value${
          id ? '.toString()' : ''
        }) !== -1) : false`
      }
    },
    nin(value, id) {
      if (value[0] instanceof Date) {
        return `value ? (${JSON.stringify(
          value.map((v) => v.valueOf()),
        )}.indexOf(value) === -1) : false`
      } else {
        return `value ? (${JSON.stringify(
          id ? value.map((v) => v.toString()) : value,
        )}.indexOf(value${id ? '.toString()' : ''}) === -1) : false`
      }
    },
    contains(value) {
      if (value[0] instanceof Date) {
        return `value ? (value.indexOf(${JSON.stringify(
          value.valueOf(),
        )}) !== -1) : false`
      } else {
        return `value ? (value.indexOf(${JSON.stringify(
          value,
        )}) !== -1) : false`
      }
    },
    some(value) {
      if (value[0] instanceof Date) {
        return `value ? (value.some(i => (${JSON.stringify(
          value.map((v) => v.valueOf()),
        )}.indexOf(i) !== -1))) : false`
      } else {
        return `value.some(i => (${JSON.stringify(value)}.indexOf(i) !== -1))`
      }
    },
    every(value) {
      if (value[0] instanceof Date) {
        return `value ? (value.every(i => (${JSON.stringify(
          value.map((v) => v.valueOf()),
        )}.indexOf(i) !== -1))) : false`
      } else {
        return `value ? (value.every(i => (${JSON.stringify(
          value,
        )}.indexOf(i) !== -1))) : false`
      }
    },
    except(value) {
      if (value[0] instanceof Date) {
        return `vale ? (value.indexOf(${JSON.stringify(
          value.valueOf(),
        )}) === -1) : false`
      } else {
        return `value ? (value.indexOf(${JSON.stringify(
          value,
        )}) === -1) : false`
      }
    },
    none(value) {
      if (value[0] instanceof Date) {
        return `value ? (value.every(i => (${JSON.stringify(
          value.map((v) => v.valueOf()),
        )}.indexOf(i) === -1))) : false`
      } else {
        return `value ? (value.every(i => (${JSON.stringify(
          value,
        )}.indexOf(i) === -1))) : false`
      }
    },
    or(value) {
      return (
        '( value ? (' +
        value.map((v) => `(${FilterData.go(v)})`).join('||') +
        ') : false )'
      )
    },
    and(value) {
      return (
        '( value ? (' +
        value.map((v) => `(${FilterData.go(v)})`).join('&&') +
        ') : false )'
      )
    },
    nor(value) {
      return (
        '( value ? !(' +
        value.map((v) => `(${FilterData.go(v)})`).join('||') +
        ') : false )'
      )
    },
    not(value) {
      return (
        '( value ? !(' +
        value.map((v) => `(${FilterData.go(v)})`).join('&&') +
        ') : false )'
      )
    },
    exists(value) {
      return `value ? (${
        value ? '' : '!'
      }(value !== undefined && value !== null && value !== '')) : ${
        value ? 'false' : 'true'
      }`
    },
    match(value) {
      return `(value ? (typeof value !== 'object' ? (new RegExp("${value}")).test(value.toString()) : false) : false)`
    },
    imatch(value) {
      return `(value ? (typeof value !== 'object' ? (new RegExp("${value}","i")).test(value.toString()) : false) : false)`
    },
  }

  public static create(obj, fieldMap: { [key: string]: any } = { id: 'id' }) {
    const filter = FilterData.go(obj, fieldMap)
    // console.log(filter.toString());
    // tslint:disable-next-line:no-eval
    return eval(
      `(value)=>${
        filter && Array.isArray(filter)
          ? filter.join('&&')
          : filter && typeof filter == 'string'
          ? filter
          : 'true'
      }`,
    )
  }

  public static go(
    node: Array<object> | object,
    fieldMap: { [key: string]: any } = { id: 'id' },
    id: boolean = false,
    result?,
  ) {
    if (Array.isArray(node)) {
      return node
        .map((n) => FilterData.go(n, fieldMap, id, result))
        .filter((n) => n)
        .join(' || ')
    } else if (
      typeof node === 'object' &&
      (node.constructor === Object || node.constructor === undefined)
    ) {
      if (!result) {
        result = []
      }
      const keys = Object.keys(node)
      keys.forEach((key) => {
        if (FilterData.operations.hasOwnProperty(key)) {
          result.push(FilterData.operations[key](node[key], id))
        } else {
          const idKey = fieldMap.hasOwnProperty(key)
          result.push(
            `((value)=>${FilterData.go(node[key], fieldMap, idKey) ||
              true})(value ? value.${idKey ? fieldMap[key] : key} : false )`,
          )
        }
      })
      return result.length > 0 ? result.join(' && ') : undefined
    } else {
      return FilterData.operations.eq(node, id)
    }
  }
}

export function prepareFilter(args) {
  return typeof args === 'object' && !Array.isArray(args)
    ? Object.keys(args).reduce((acc, key) => {
        if (key === 'ids') {
          return {
            ...acc,
            id: { in: prepareFilter(args[key]) },
          }
        }
        return set(acc, key.replace('-', '.'), prepareFilter(args[key]))
      }, {})
    : args
}
export function makeFilter(args) {
  if (!args['q']) {
    const filter = prepareFilter(args)
    return FilterData.create(filter)
  } else {
    const pattern = args['q']
    const regex = new RegExp(pattern, 'i')
    return (data) => {
      return deep(data, regex)
    }
  }
}
export function filterQuery(
  query: firebase.firestore.Query<firebase.firestore.DocumentData>,
  filter: {
    [filter: string]: any
  },
): firebase.firestore.Query<firebase.firestore.DocumentData> {
  let result: firebase.firestore.Query<firebase.firestore.DocumentData> = query
  Object.keys(filter).forEach((key) => {
    const [field, op] = key.split('-')
    switch (op) {
      case 'eq':
      case undefined:
        result = result.where(field, '==', filter[key])
        break
      case 'lt':
        result = result.where(field, '<', filter[key])
        break
      case 'gt':
        result = result.where(field, '>', filter[key])
        break
      case 'lte':
        result = result.where(field, '<=', filter[key])
        break
      case 'gte':
        result = result.where(field, '>=', filter[key])
        break
      case 'in':
        result = result.where(field, 'in', filter[key])
        break
    }
  })
  return result
}
export function* sliceArray(array: Array<any>, limit) {
  if (array.length <= limit) {
    yield [...array]
  } else {
    const current = [...array]
    while (true) {
      if (current.length === 0) {
        break
      } else {
        yield current.splice(0, limit - 1)
      }
    }
  }
}
