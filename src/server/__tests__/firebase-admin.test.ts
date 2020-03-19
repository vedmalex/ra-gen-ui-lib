import 'jest'

import { FirebaseAdmin, ID } from '../firebase-admin'

describe('firebase schema', () => {
  it('ID', () => {
    // ID.build()
    expect(ID.schema).toMatchSnapshot('ID')
  })
  it('schema', () => {
    FirebaseAdmin.build()
    expect(FirebaseAdmin.schema).toMatchSnapshot('overall schema')
  })
})
