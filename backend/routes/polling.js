const pool = require("../db");
const PollingManager = require('../services/polling/pollingManager')

const express = require("express");
const router = express.Router();

//   { 'DB10,REAL10': 23.5, 'DB10,INT4': 42, ... }
async function callback(err, res) {
    if (err) {
        console.error('Polling read error:', err.message);
        return;
    }

    if (!res) return;

    // Step 1: separa le chiavi (indirizzi PLC) e i valori letti in due array paralleli
    //   addresses = ['DB10,REAL10', 'DB10,INT4', ...]
    //   values    = [23.5,          42,          ...]
    const addresses = Object.keys(res);
    const values = Object.values(res).map(v => typeof v === 'boolean' ? (v ? 1 : 0) : v);

    try {
        await pool.query(
            `INSERT INTO data (timestamp, sensor_id, value)
             -- Step 2: UNNEST "spacchetta" i due array in righe virtuali
             --   risultato intermedio:
             --   address        | value
             --   'DB10,REAL10'  | 23.5
             --   'DB10,INT4'    | 42
             SELECT
               NOW(),        -- Step 3: timestamp generato lato DB, uguale per tutte le righe della stessa lettura
               config.id,    -- Step 4: JOIN su config risolve address -> sensor_id senza query extra
               v.value       -- Step 5: valore letto dal PLC
             FROM UNNEST($1::varchar[], $2::numeric[]) AS v(address, value)
             JOIN config ON config.address = v.address`,
            [addresses, values]
        );
    } catch (e) {
        console.error('Database insert error:', e.message);
    }
}

let manager = null;

router.post('/start', (async (req, res) => {
    try {
        if (manager && manager.isRunning) {
            return res.status(400).json({ message: 'Polling is already running' });
        }

        const dbRes = await pool.query('SELECT * FROM plc_config');
        const row = dbRes.rows[0];
        const { ip, port, rack, slot } = row;

        const variables = await pool.query('SELECT * FROM config ORDER BY id');
        const rows = variables.rows;

        const variablesMap = {};
        rows.forEach(r => {
            variablesMap[r.name] = {
                address: r.address,
                samplingTime: r.sampling_interval
            }
        });

        manager = new PollingManager(ip, port, rack, slot);
        await manager.start(variablesMap, callback);

        res.status(200).json({ message: 'Polling started' });
    } catch (e) {
        res.status(500).json({ message: 'Polling start error: ' + e.message });
    }
}))

router.post('/stop', (async (req, res) => {
    try {
        if (!manager) {
            return res.status(400).json({ message: 'Polling is not running' });
        }

        await manager.stop();

        res.status(200).json({ message: 'Polling stopped' });
    } catch (e) {
        res.status(500).json({ message: 'Polling stop error: ' + e.message });
    }
}))

module.exports = router;
