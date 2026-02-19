const S7Service = require('./s7Service');
const s7 = new S7Service();

async function main() {
  try {
    await s7.connect(
      '192.168.33.170',
      102,
      0,
      1,
      ['DB1,REAL0', 'DB1,X6.0']
    );
    console.log('Addresses:', ['DB1,REAL0', 'DB1,X6.0']);
    const data = await s7.readVariables();
    console.log('Data:', data);

    await s7.disconnect();
  } catch (e) {
    console.error('S7 error:', e.message);
    process.exit(1);
  }
}

main();
