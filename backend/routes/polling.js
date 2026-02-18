const pool = require("../db");
const pollingManager = require('../services/polling/pollingManager')

const express = require("express");
const router = express.Router();


router.post('/start', (async (req, res) => {
    try {
        const plcConfig = await pool.query('SELECT * FROM plc_config').rows[0];
        const { id, ip, rack, slot } = plcConfig;

        const variables = await pool.query('SELECT * FROM config').rows;
        const addresses = variables.map(r => r.address);

        const pollingManager = new pollingManager(ip, port, rack, slot);
        await pollingManager.connect(variables); // <---------------------- DA VEDERE LA RISPOSTA DEL DB
    } catch (e) {
        throw new Error (e.message);
    }
}))
// TODO routes
