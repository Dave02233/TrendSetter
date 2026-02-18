const pool = require('../../db');

const S7Service = require('../s7/s7Service');

class pollingManager {
    constructor(ip, port, rack, slot) {
        this.ip = ip,
            this.port = port,
            this.rack = rack,
            this.slot = slot,
            this.isRunning = false,
            this.service = new S7Service(),
            this._addresses = [],
            this._allSamplingTimes = [],
            this._samplingTimes = [],
            this._intervalIds = []
    }

    async start(variables, subscriber) {
        /*
        {
            'Var1': {
                    'address': 'DB10,REAL10',
                    'samplingTime': 1000
                }
            ...
        }
        */

        if (this.isRunning) return;

        this._addresses = Object.values(variables).map(v => v.address);
        if (this._addresses.length === 0) throw new Error('No adresses in the variables');
        this._allSamplingTimes = Object.values(variables).map(v => v.samplingTime);
        if (this._allSamplingTimes.length === 0) throw new Error('No sampling times in the variables');

        this._samplingTimes = [...new Set(this._allSamplingTimes)];

        try {
            await this.service.connect(
                this.ip,
                this.port,
                this.rack,
                this.slot,
                this._addresses
            );

            let res;
            this._intervalIds = [];

            this._samplingTimes.forEach((samplingTime, i) => {
                const id = setInterval(async _ => {
                    try {
                        res = await this.service.readVariables();
                        // <---------------------------------------- Scrittura su DB
                        await fetch()
                    } catch (e) {
                        throw new Error(e.message);
                    }
                }, samplingTime)

                this._intervalIds.push(id);
            });

            this.isRunning = true;

        } catch (e) {
            throw new Error('Start polling error: ' + e.message);
        }

    }

    async stop() {
        try {
            this._intervalIds.forEach(id => {
                clearInterval(id);
            })

            await this.service.disconnect();
            this.isRunning = false;
            
        } catch (e) {
            throw new Error(e.message);
        }
    }

    get status() {
        return {
            isRunning: this.isRunning,
            addresses: this._addresses,
            samplingTimes: this._samplingTimes,
            activeIntervals: this._intervalIds.length
        };
    }
}


module.exports = pollingManager;