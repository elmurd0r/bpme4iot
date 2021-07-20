export default class CustomPalette {
  constructor(bpmnFactory, create, elementFactory, palette, translate) {
    this.bpmnFactory = bpmnFactory;
    this.create = create;
    this.elementFactory = elementFactory;
    this.translate = translate;

    palette.registerProvider(this);
  }

  getPaletteEntries(element) {
    const {
      bpmnFactory,
      create,
      elementFactory,
      translate
    } = this;

    function createIotObj(iotType) {
      return function(event) {
        const businessObject = bpmnFactory.create('bpmn:DataObjectReference');

        businessObject.set('iot:type', iotType);

        businessObject.iotType = iotType;

        const shape = elementFactory.createShape({
          type: 'bpmn:DataObjectReference',
          businessObject: businessObject
        });

        create.start(event, shape);
      };
    }

    function createIotStart(iotType) {
      return function(event) {
        const businessObject = bpmnFactory.create('bpmn:StartEvent');

        businessObject.set('iot:type', iotType);

        businessObject.iotType = iotType;

        const shape = elementFactory.createShape({
          type: 'bpmn:StartEvent',
          businessObject: businessObject
        });

        create.start(event, shape);
      };
    }

    return {
      'create.iot-sensor': {
        group: 'iot',
        title: translate('Create IoT Sensor'),
        className: 'iot sensor',
        action: {
          dragstart: createIotObj("sensor"),
          click: createIotObj("sensor")
        }
      },
      'create.iot-actor': {
        group: 'iot',
        className: 'iot actor',
        title: translate('Create IoT Actor'),
        action: {
          dragstart: createIotObj("actor"),
          click: createIotObj("actor")
        }
      },
      'create.iot-sensor-sub': {
        group: 'iot',
        className: 'iot sensor-sub',
        title: translate('Create IoT Sensor Sub'),
        action: {
          dragstart: createIotObj("sensor-sub"),
          click: createIotObj("sensor-sub")
        }
      },
      'create.iot-actor-sub': {
        group: 'iot',
        className: 'iot actor-sub',
        title: translate('Create IoT Actor Sub'),
        action: {
          dragstart: createIotObj("actor-sub"),
          click: createIotObj("actor-sub")
        }
      },
      'create.iot-obj': {
        group: 'iot',
        className: 'iot obj',
        title: translate('Create IoT Object'),
        action: {
          dragstart: createIotObj("obj"),
          click: createIotObj("obj")
        }
      },
      'create.iot-start': {
        group: 'iot',
        className: 'iot start',
        title: translate('Create IoT Start'),
        action: {
          dragstart: createIotStart("start"),
          click: createIotStart("start")
        }
      }
    };
  }
}

CustomPalette.$inject = [
  'bpmnFactory',
  'create',
  'elementFactory',
  'palette',
  'translate'
];
