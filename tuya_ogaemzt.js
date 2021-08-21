const fz = require('zigbee-herdsman-converters/converters/fromZigbee');
const tz = require('zigbee-herdsman-converters/converters/toZigbee');
const exposes = require('zigbee-herdsman-converters/lib/exposes');
const tuya = require('zigbee-herdsman-converters/lib/tuya');
const e = exposes.presets;
const ea = exposes.access;

const fzLocal = {
    tuya_cover: {
        cluster: 'manuSpecificTuya',
        type: ['commandSetDataResponse', 'commandGetData'],
        convert: (model, msg, publish, options, meta) => {
            // Protocol description
            // https://github.com/Koenkk/zigbee-herdsman-converters/issues/1159#issuecomment-614659802

            const dp = msg.data.dp;
            const value = tuya.getDataValue(msg.data.datatype, msg.data.data);

            switch (dp) {
            case tuya.dataPoints.state: // Confirm opening/closing/stopping (triggered from Zigbee)
            case tuya.dataPoints.coverPosition: // Started moving to position (triggered from Zigbee)
            case tuya.dataPoints.coverChange: // Started moving (triggered by transmitter or pulling on curtain)
                return {running: true};
            case tuya.dataPoints.coverArrived: { // Arrived at position
                const invert = tuya.isCoverInverted(meta.device.manufacturerName) ? !options.invert_cover : options.invert_cover;
                const position = invert ? 100 - (value & 0xFF) : (value & 0xFF);
                meta.logger.debug(`TuYa_cover_position: ${position}, value: ${value}`);
                if (position > 0 && position <= 100) {
                    return {running: false, position: position, state: 'OPEN'};
                } else if (position == 0) { // Report fully closed
                    return {running: false, position: position, state: 'CLOSE'};
                } else {
                    return {running: false}; // Not calibrated yet, no position is available
                }
            }
            case tuya.dataPoints.coverSpeed: // Cover is reporting its current speed setting
                return {motor_speed: value};
            case tuya.dataPoints.config: // Returned by configuration set; ignore
                break;
            default: // Unknown code
                meta.logger.warn(`TuYa_cover_control: Unhandled DP #${dp} for ${meta.device.manufacturerName}:
                ${JSON.stringify(msg.data)}`);
            }
        },
    },
};

const tzLocal = {
    tuya_cover_control: {
        key: ['state', 'position'],
        convertSet: async (entity, key, value, meta) => {
            // Protocol description
            // https://github.com/Koenkk/zigbee-herdsman-converters/issues/1159#issuecomment-614659802

            if (key === 'position') {
                if (value > 0 && value < 100) {
                    const invert = tuya.isCoverInverted(meta.device.manufacturerName) ?
                        !meta.options.invert_cover : meta.options.invert_cover;

                    value = invert ? 100 - value : value;
                    value |= 0x640000;
                    await tuya.sendDataPointValue(entity, tuya.dataPoints.coverPosition, value);
                } else if (value == 0) {
                    const stateEnums = tuya.getCoverStateEnums(meta.device.manufacturerName);
                    await tuya.sendDataPointEnum(entity, tuya.dataPoints.state, stateEnums.close);
                } else if (value == 100) {
                    const stateEnums = tuya.getCoverStateEnums(meta.device.manufacturerName);
                    await tuya.sendDataPointEnum(entity, tuya.dataPoints.state, stateEnums.open);
                } else {
                    throw new Error('TuYa_cover_control: Curtain motor position is out of range');
                }
            } else if (key === 'state') {
                const stateEnums = tuya.getCoverStateEnums(meta.device.manufacturerName);
                meta.logger.debug(`TuYa_cover_control: Using state enums for ${meta.device.manufacturerName}:
                ${JSON.stringify(stateEnums)}`);

                value = value.toLowerCase();
                switch (value) {
                case 'close':
                    await tuya.sendDataPointEnum(entity, tuya.dataPoints.state, stateEnums.close);
                    break;
                case 'open':
                    await tuya.sendDataPointEnum(entity, tuya.dataPoints.state, stateEnums.open);
                    break;
                case 'stop':
                    await tuya.sendDataPointEnum(entity, tuya.dataPoints.state, stateEnums.stop);
                    break;
                default:
                    throw new Error('TuYa_cover_control: Invalid command received');
                }
            }
        },
    },
};

const device = {
    zigbeeModel: ['ogaemzt'],
    model: 'TS0601_cover_ogaemzt',
    vendor: 'TuYa',
    description: 'Curtain motor/roller blind motor/window pusher/tubular motor',
    fromZigbee: [fzLocal.tuya_cover, fz.ignore_basic_report],
    toZigbee: [tzLocal.tuya_cover_control, tz.tuya_cover_options],
    exposes: [
        e.cover_position().setAccess('position', ea.STATE_SET),
        exposes.composite('options', 'options')
            .withFeature(exposes.numeric('motor_speed', ea.STATE_SET)
                .withValueMin(0)
                .withValueMax(255)
                .withDescription('Motor speed'))],
};

module.exports = device;
