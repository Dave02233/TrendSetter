const S7Service = require('./s7Service');
const s7 = new S7Service();

console.log(process.env)

async function main() {
  try {
    await s7.connect(
      '192.168.54.150',
      102,
      0,
      1,
      ['DB40,REAL12', 'DB40,X3.4']
    );
    console.log('Addresses:', ['DB205,DBX0.0', 'DB40,DBX3.4']);
    const data = await s7.readVariables();
    console.log('Data:', data);  

    await s7.disconnect();
  } catch (e) {
    console.error('S7 error:', e.message);
    process.exit(1);
  }
}

main();
