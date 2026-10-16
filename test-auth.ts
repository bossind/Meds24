import bcrypt from 'bcryptjs';
import assert from 'assert';

async function runTests() {
  console.log('Running Admin Authentication & Bcrypt Hash Unit Tests...');

  const passcode = 'MySecure10DigitPasscode123';
  const salt = await bcrypt.genSalt(10);
  const hashedPasscode = await bcrypt.hash(passcode, salt);

  // Test 1: Valid passcode against bcrypt hash
  const isValid = await bcrypt.compare(passcode, hashedPasscode);
  assert.strictEqual(isValid, true, 'Test 1 Failed: Valid passcode should match bcrypt hash');
  console.log('✓ Test 1 Passed: Valid passcode matched bcrypt hash');

  // Test 2: Invalid passcode against bcrypt hash
  const isInvalid = await bcrypt.compare('WrongPasscode', hashedPasscode);
  assert.strictEqual(isInvalid, false, 'Test 2 Failed: Wrong passcode must not match bcrypt hash');
  console.log('✓ Test 2 Passed: Wrong passcode rejected by bcrypt hash');

  // Test 3: Quoted hash sanitization simulation
  const quotedHash = `"${hashedPasscode}"`;
  const sanitizedHash = quotedHash.trim().replace(/^["']|["']$/g, '');
  const isQuotedValid = await bcrypt.compare(passcode, sanitizedHash);
  assert.strictEqual(isQuotedValid, true, 'Test 3 Failed: Quoted hash sanitization failed');
  console.log('✓ Test 3 Passed: Quoted hash sanitization and verification successful');

  console.log('\nAll Admin Authentication tests passed successfully!');
}

runTests().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
