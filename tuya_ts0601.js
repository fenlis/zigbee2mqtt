const fz = require('zigbee-herdsman-converters/converters/fromZigbee');
const tz = require('zigbee-herdsman-converters/converters/toZigbee');
const exposes = require('zigbee-herdsman-converters/lib/exposes');
const e = exposes.presets;
const ea = exposes.access;

const device = {
    zigbeeModel: ['TS0601'],
    model: 'YS-MT750L',
    vendor: 'TuYa',
    description: 'Curtain motor/roller blind motor/window pusher/tubular motor',
    fromZigbee: [fz.tuya_cover, fz.ignore_basic_report],
    toZigbee: [tz.tuya_cover_control, tz.tuya_cover_options],
    exposes: [
        e.cover_position().setAccess('position', ea.STATE_SET),
        exposes.composite('options', 'options')
            .withFeature(exposes.numeric('motor_speed', ea.STATE_SET)
                .withValueMin(0)
                .withValueMax(255)
                .withDescription('Motor speed'))],
};

module.exports = device;
