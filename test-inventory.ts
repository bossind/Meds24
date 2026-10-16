import test from 'node:test';
import assert from 'node:assert/strict';

// Test FEFO (First-Expired, First-Out) batch allocation simulation logic
function allocateBatches(orderQty: number, batches: { id: number; batchNumber: string; expiryDate: string; availableQty: number }[]) {
  // Sort by expiry date ascending
  const sorted = [...batches].sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
  let remaining = orderQty;
  const allocations: { batchId: number; batchNumber: string; quantity: number }[] = [];

  for (const b of sorted) {
    if (remaining <= 0) break;
    if (b.availableQty <= 0) continue;

    const take = Math.min(remaining, b.availableQty);
    allocations.push({ batchId: b.id, batchNumber: b.batchNumber, quantity: take });
    remaining -= take;
  }

  if (remaining > 0) {
    throw new Error(`Insufficient stock in batches. Short by ${remaining} units.`);
  }

  return allocations;
}

test('FEFO batch allocation selects nearest expiry batch first', () => {
  const batches = [
    { id: 1, batchNumber: 'B001', expiryDate: '2026-12-31', availableQty: 50 },
    { id: 2, batchNumber: 'B002', expiryDate: '2026-06-30', availableQty: 20 }, // Earlier expiry
    { id: 3, batchNumber: 'B003', expiryDate: '2027-03-31', availableQty: 100 }
  ];

  const allocations = allocateBatches(35, batches);
  assert.equal(allocations.length, 2);
  assert.equal(allocations[0].batchId, 2); // B002 taken first (20 qty)
  assert.equal(allocations[0].quantity, 20);
  assert.equal(allocations[1].batchId, 1); // B001 taken next (15 qty)
  assert.equal(allocations[1].quantity, 15);
});

test('FEFO throws error if insufficient stock across batches', () => {
  const batches = [
    { id: 1, batchNumber: 'B001', expiryDate: '2026-12-31', availableQty: 10 }
  ];

  assert.throws(() => {
    allocateBatches(25, batches);
  }, /Insufficient stock/);
});
