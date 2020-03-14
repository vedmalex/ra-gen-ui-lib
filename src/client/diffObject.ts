import * as diff from 'jsondiffpatch'
const patcher = diff.create()

export function getDiffObject(prev, current) {
  const d = patcher.diff(prev, current)
  if (d) {
    return Object.keys(d).reduce((res, cur) => {
      res[cur] = current[cur]
      return res
    }, {})
  }
}
