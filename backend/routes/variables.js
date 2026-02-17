const pool = require('../db');

const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {

    try {
        const dbRes = await pool.query('SELECT * FROM config;');
        res.json(dbRes.rows);
    } catch (e) {
        res.status(404).json({
            message: 'Error fetching variables'
        });
    };

});

router.post('/', async (req, res) => {
    const { body } = req;
    const { name, address, data_type, sampling_interval } = body;

    const validIntervals = [500, 1000, 5000];

    if (typeof name !== 'string' || 
        typeof address !== 'string' ||
        typeof data_type !== 'string' ||
        typeof sampling_interval !== 'number'||
        !validIntervals.includes(sampling_interval)) {

        return res.status(400).json({message: 'Invalid variable data'});
    }

    try {
        const dbRes = await pool.query(`
        INSERT INTO config (
            name,
            address,
            data_type,
            sampling_interval
        ) VALUES (
            $1,
            $2,
            $3,
            $4
        ) RETURNING *;
        `, 
        [name, address, data_type, sampling_interval]
        );

        res.status(201).json(dbRes.rows[0]);

    } catch (e) {
        console.error('Errore POST:', e)
        res.status(500)
            .json({
                message: 'Error posting new variables'
            });
    };
});

router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const dbRes = await pool.query(`
        DELETE FROM config WHERE id = $1 RETURNING *    
        `, 
        [id]
        );
        
        if (dbRes.rows.length === 0) {
            return res.status(404)
                .json({
                    message: 'Variable not found'
                }); 
        }

        res.status(200).json(dbRes.rows[0]);

    } catch (e) {
        res.status(500)
            .json({
                message: 'Error deleting variable'
            });
    };

});

router.post('/apply', async (req, res) => {
    
    const { body } = req;
    const { variables } = body;

    if (!Array.isArray(variables)) {
        return res.status(400);
    }

    if (variables.length === 0) {
        return res.status(400);
    }
    
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        await client.query('TRUNCATE config RESTART IDENTITY CASCADE');

        for (const variable of variables) {
            const { name, address, data_type, sampling_interval } = variable;

            const validIntervals = [500, 1000, 5000];

            if (typeof name !== 'string' || 
                typeof address !== 'string' ||
                typeof data_type !== 'string' ||
                typeof sampling_interval !== 'number'||
                !validIntervals.includes(sampling_interval)) {
                
                await client.query('ROLLBACK');
                return res.status(400).json({message: 'Invalid variable data'});
            }

            await client.query(`
                INSERT INTO config (
                name, address, data_type, sampling_interval
                ) VALUES (
                $1, $2, $3, $4
                )
            `, 
            [name, address, data_type, sampling_interval])
        }
        await client.query('COMMIT');
        res.status(201).json({message: 'Configuration applied successfully'});

    } catch (e) {
        await client.query('ROLLBACK');
        res.status(500)
            .json({
                message: "Error applying configuration, fallback"
            });
    } finally {
        client.release();
    }
});

module.exports = router