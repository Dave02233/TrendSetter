require('dotenv').config();
const S7Service = require('../s7/s7Service');

class pollingManager {
    constructor (ip, port, rack, slot) {
        this.ip = ip,
        this.port = port,
        this.rack = rack, 
        this.slot = slot,
        this.isRunning = false,
        this.service = new S7Service (),
        this._addresses = [],
        this._allSamplingTimes = [],
        this._samplingTimes = [],
        this._intervalIds = []
    }

    async start(variables) {

        if (this.isRunning) return ;

        // Fare query per prendere variabili

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
                    } catch (e) {
                        throw new Error (e.message);
                    }
                }, samplingTime)  
                
                this._intervalIds.push(id);
            });

            this.isRunning = true;

        } catch (e) {
            throw new Error ('Start polling error: ' + e.message);
        }
        
    }

    // Stop, fermando gli interval

    // Status, returna lo status attuale del servizio

}




module.exports = pollingManager;