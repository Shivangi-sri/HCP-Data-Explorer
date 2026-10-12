import { expect, test } from 'vitest'
import { generateRows } from './data-generator'

test('generator is deterministic and returns 50,000 rows', () => {
  const a = generateRows()
  const b = generateRows()
  expect(a).toHaveLength(50000)
  expect(a[12345]).toEqual(b[12345])
})
