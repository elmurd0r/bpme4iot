import BaseRenderer from 'diagram-js/lib/draw/BaseRenderer';

import artifact from "../svg/test_artifact.svg";
import start from "../svg/start.svg";

import {
  remove as svgRemove,
  attr as svgAttr,
  create as svgCreate
} from 'tiny-svg';

import {
  getRoundRectPath
} from 'bpmn-js/lib/draw/BpmnRenderUtil';

import {
  is,
  getBusinessObject
} from 'bpmn-js/lib/util/ModelUtil';

import { isNil } from 'min-dash';

const HIGH_PRIORITY = 1500,
      TASK_BORDER_RADIUS = 2;


export default class CustomRenderer extends BaseRenderer {
  constructor(eventBus, bpmnRenderer) {
    super(eventBus, HIGH_PRIORITY);

    this.bpmnRenderer = bpmnRenderer;
  }

  canRender(element) {
    // ignore labels
    return !element.labelTarget;
  }

  drawShape(parentNode, element) {
    const shape = this.bpmnRenderer.drawShape(parentNode, element);
    const iotType = this.getIotType(element);

    if (!isNil(iotType)) {

      let imageHref;
      switch (iotType) {
        case 'start':
          imageHref = start;
          break;
        case 'actor':
          imageHref = artifact;
          break;
        case 'actor-sub':
          imageHref = artifact;
          break;
        case 'obj':
          imageHref = artifact;
          break;
        case 'sensor-sub':
          imageHref = artifact;
          break;
        case 'sensor':
        default:
          imageHref = artifact;
      }

      //const img = drawIot(parentNode, 36, 52, imageHref);
      const img = drawIot(parentNode, element.width, element.height, imageHref);

      prependTo(img, parentNode);
      svgRemove(shape);
      return shape;
    }

    return shape;
  }

  getIotType(element) {
    const businessObject = getBusinessObject(element);

    const type = businessObject.get('iot:type');

    return type ? type : null;
  }

  getShapePath(shape) {
    if (is(shape, 'bpmn:DataObjectReference')) {
      return getRoundRectPath(shape, TASK_BORDER_RADIUS);
    }

    return this.bpmnRenderer.getShapePath(shape);
  }
}

CustomRenderer.$inject = [ 'eventBus', 'bpmnRenderer' ];

// helpers //////////

function drawIot(parentNode, width, height, image) {
    const img = svgCreate(image);

    svgAttr(img, {
      width: width,
      height: height
    });

    return img;
}
function prependTo(newNode, parentNode, siblingNode) {
  parentNode.insertBefore(newNode, siblingNode || parentNode.firstChild);
}
