import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer';
import {is, getBusinessObject} from 'bpmn-js/lib/util/ModelUtil';
const {EventEmitter} = require('events');
const {Engine} = require('bpmn-engine');
const axios = require('axios').default;
const workerpool = require('workerpool');

import {confirmIcon, errIcon} from "../svg/Icons";
import customModule from '../custom/executer';
import iotExtension from '../../resources/iot.json';
import camundaExtension from '../../resources/camunda.json';
import { isNil } from 'min-dash';

const processModel = sessionStorage.getItem('xml') ? sessionStorage.getItem('xml') : '';
const containerEl = document.getElementById('js-canvas');
const runBtn = document.getElementById('runBtn');
import {Timers} from "./Timer";
import {TreeNode} from "./TreeNode";
import {
  convertInputToBooleanOrKeepType,
  convertInputToFloatOrKeepType,
  getResponseByAttributeAccessor
} from "./ExecuteHelper";

let start_t;
let end_t;
let executedTasksArr = [];
const pool = workerpool.pool('/worker.js');
let timeout;

// create modeler
const bpmnViewer = new NavigatedViewer({
  container: containerEl,
  additionalModules: [
    customModule
  ],
  moddleExtensions: {
    iot: iotExtension,
    camunda: camundaExtension
  }
});

let overlays = bpmnViewer.get('overlays');

// import XML
bpmnViewer.importXML(processModel).then(() => {
  bpmnViewer.get("canvas").zoom("fit-viewport", "auto");
}).catch((err) => {
  console.error(err);
});


//Engine stuff
const listener = new EventEmitter();

const engine = Engine({
  name: 'process model execution',
  source: processModel,
  timers: Timers(),
  moddleOptions: {
    iot: iotExtension,
    camunda: camundaExtension
  }
});

listener.on('activity.timer', (api, execution) => {
  timeout = api.content.timeout;
  console.log(api.content.startedAt + api.content.timeout);
});

listener.on('activity.timeout', (api, execution) => {
  // Hier kommen wir rein, wenn die Boundary-Event-Zeit abläuft
  //pool.terminate({force:true});
  console.log("Tjah pech");
});

listener.on('activity.start', (start) => {
  start_t = new Date().getTime();

  console.log("=-=-=-=-=-=-=-=");
  console.log(start.id);
  fillSidebarRightLog("=-=-=-=-=-=-=-=");
  fillSidebarRightLog(start.id);
});


listener.on('activity.wait', (waitObj) => {
  let sourceId = waitObj.content.inbound;

  let taskArr = bpmnViewer.get('elementRegistry').filter(element => is(element, "bpmn:Task"));
  let startEventArr = bpmnViewer.get('elementRegistry').filter(element => is(element, "bpmn:StartEvent"));
  let catchEventArr = bpmnViewer.get('elementRegistry').filter(element => is(element, "bpmn:IntermediateCatchEvent"));
  let boundaryEventArr = bpmnViewer.get('elementRegistry').filter(element => is(element, "bpmn:BoundaryEvent"));
  let boundaryEvent = boundaryEventArr.filter(boundaryEvent => boundaryEvent.businessObject.attachedToRef.id === waitObj.id);
  let boundaryEventType = boundaryEvent? boundaryEvent.map(event => event.businessObject.eventDefinitions[0]['$type']) : [];

  let startEvent = startEventArr.find(startEvent => startEvent.id === waitObj.id);
  let catchEvent = catchEventArr.find(catchEvent => catchEvent.id === waitObj.id && catchEvent?.businessObject.type === 'catch');
  let throwEvent = catchEventArr.find(throwEvent => throwEvent.id === waitObj.id && throwEvent?.businessObject.type === 'throw');
  let task = taskArr.find(task => task.id === waitObj.id);

  if(startEvent || catchEvent) {
    let event = startEvent ? startEvent : catchEvent;
    const mathLoopCall = (businessObj, eventValue) => {
      let extensionElements = businessObj.get("extensionElements")?.values;
      //let name = businessObj.get("extensionElements")?.values[0]?.values?.find(elem => elem.name === 'key')?.value;
      //let mathOp = businessObj.get("extensionElements")?.values[0]?.values?.find(s => s.name === ">" || s.name === "<" || s.name === "=")?.name;
      //let mathOpVal = businessObj.get("extensionElements")?.values[0]?.values?.find(s => s.name === ">" || s.name === "<" || s.name === "=")?.value;
      //let timeout = businessObj.get("extensionElements")?.values[0]?.values?.find(elem => elem.name === 'timeout')?.value;

      // NEUE ELEMENTE:
      let name = extensionElements.filter(element => element['$type'] === 'iot:Properties')[0].values[0].key;
      let mathOp = extensionElements.filter(element => element['$type'] === 'iot:Properties')[0].values[0].mathOP;
      let mathOpVal = extensionElements.filter(element => element['$type'] === 'iot:Properties')[0].values[0].value;
      let timeout = extensionElements.filter(element => element['$type'] === 'iot:Properties')[0].values[0].timeout;

      if (name && mathOp && mathOpVal && mathOpVal) {
        mathOpVal = convertInputToFloatOrKeepType(mathOpVal);
        const axiosGet = () => {
          let noTimeoutOccured =  new Date().getTime() - start_t <= timeout * 1000;
          if(!timeout || noTimeoutOccured) {
            axios.get(eventValue).then((resp) => {
              let resVal = getResponseByAttributeAccessor(resp.data, name);
              if (!isNil(resVal)) {
                switch (mathOp) {
                  case '<' :
                    if (parseFloat(resVal) < mathOpVal) {
                      console.log(name + " reached state " + resVal);
                      fillSidebarRightLog(name + " reached state " + resVal);
                      waitObj.signal();
                    } else {
                      console.log("WAIT UNTIL " + name + " with state " + resVal + " reached");
                      fillSidebarRightLog("WAIT UNTIL " + name + " with state " + resVal + " reached");
                      axiosGet();
                    }
                    break;
                  case '=' :
                    mathOpVal = convertInputToBooleanOrKeepType(mathOpVal)
                    if (resVal === mathOpVal) {
                      console.log(name + " reached state " + resVal);
                      fillSidebarRightLog(name + " reached state " + resVal);
                      waitObj.signal();
                    } else {
                      console.log("WAIT UNTIL " + name + " with state " + resVal + " reached");
                      fillSidebarRightLog("WAIT UNTIL " + name + " with state " + resVal + " reached");
                      axiosGet();
                    }
                    break;
                  case '>' :
                    if (parseFloat(resVal) > mathOpVal) {
                      console.log(name + " reached state " + resVal);
                      fillSidebarRightLog(name + " reached state " + resVal);
                      waitObj.signal();
                    } else {
                      console.log("WAIT UNTIL " + name + " with state " + resVal + " reached");
                      fillSidebarRightLog("WAIT UNTIL " + name + " with state " + resVal + " reached");
                      axiosGet();
                    }
                    break;
                  default:
                    console.log("Default case stopped IoT start");
                    fillSidebarRightLog("Default case stopped IoT start");
                    engine.stop();
                }
              } else {
                console.log("Key not in response - IoT start");
                fillSidebarRightLog("Key not in response - IoT start");
              }
            }).catch((e) => {
              console.log(e);
              console.log("Recursion axios error in input");
              fillSidebarRightLog("Recursion axios error in input: " + e);
              highlightErrorElements(null, waitObj, "Not executed", e, "-", boundaryEventType);
            });
          } else {
            fillSidebarRightLog("Timeout occurred");
            highlightErrorElements(null, waitObj, "Not executed", "event/start timeout", "-", boundaryEventType);
          }
        }
        axiosGet();
      } else {
        console.log("Error in extensionsElement in IoT start");
        fillSidebarRightLog("Error in extensionsElement in IoT start");
        highlightErrorElements(null, waitObj, "Not executed", "start extensionElement", '-', boundaryEventType);
      }
    }

    let businessObj = getBusinessObject(event);
    let eventValUrl = businessObj.get("extensionElements")?.values.filter(element => element['$type'] === 'iot:Properties')[0].values[0].url;
    //let Link = businessObj.get("extensionElements")?.values.filter(element => element['$type'] === 'iot:Properties')[0].values[0].url;

    if(businessObj.type) {
      if(eventValUrl) {
        mathLoopCall(businessObj, eventValUrl);
      }
      else {
        console.log("No iot start URL value defined");
        fillSidebarRightLog("No iot start URL value defined");
        engine.stop();
      }
    } else {
      waitObj.signal();
    }
  }

  if(throwEvent) {
    let businessObj = getBusinessObject(throwEvent);
    let eventValUrl = businessObj.get("extensionElements")?.values.filter(element => element['$type'] === 'iot:Properties')[0].values[0].url;
    let method = businessObj.get("extensionElements")?.values.filter(element => element['$type'] === 'iot:Properties')[0].values[0].method;
    if(eventValUrl) {
      if(method === 'GET') {
        axios.get( eventValUrl).then((resp)=>{
          console.log("HTTP GET successfully completed");
          console.log('Executed call: ' + eventValUrl);
          fillSidebarRightLog("HTTP GET successfully completed");
          fillSidebarRightLog('Executed GET: ' + eventValUrl);
          waitObj.signal();
        }).catch((e)=>{
          console.log(e);
          console.log("HTTP GET FAILED!! - DataOutputAssociation ACTOR");
          fillSidebarRightLog("HTTP GET FAILED!! - DataOutputAssociation ACTOR: "+e);
          highlightErrorElements(null, waitObj, "Not executed" , e, sourceId[0].sourceId,boundaryEventType);
        });
      } else {
        axios.post( eventValUrl, {}, { headers: {'Content-Type': 'application/json','Access-Control-Allow-Origin': '*'}}).then((resp)=>{
          console.log("HTTP POST successfully completed");
          console.log('Executed call: ' + eventValUrl);
          fillSidebarRightLog("HTTP POST successfully completed");
          fillSidebarRightLog('Executed call: ' + eventValUrl);
          waitObj.signal();
        }).catch((e)=>{
          console.log(e);
          console.log("HTTP POST FAILED!! - DataOutputAssociation ACTOR");
          fillSidebarRightLog("HTTP POST FAILED!! - DataOutputAssociation ACTOR: "+e);
          highlightErrorElements(null, waitObj, "Not executed" , e, sourceId[0].sourceId,boundaryEventType);
        });
      }
    } else {
      console.log("Error in extensionsElement in IoT intermediate actor event");
      fillSidebarRightLog("Error in extensionsElement in IoT intermediate actor event");
      highlightErrorElements(null, waitObj, "Not executed" , "extensionElement", sourceId[0].sourceId, boundaryEventType);
    }
  }

  const extractedInputs = (iotInputs, workerArr) => {
    iotInputs.forEach(input => {
      let businessObj = getBusinessObject(input);

      if (businessObj.type === 'sensor') {
        workerArr.push(
            pool.exec('sensorCall', [businessObj], {
              on: payload => {
                fillSidebarRightLog(payload.status);
              }
            }).then(result => {
              console.log("Result:");
              console.log(result);
              if (result.value) {
                waitObj.environment.variables[input.id] = result.value;
              }
              highlightElement(input, "rgba(66, 180, 21, 0.7)");
              return result;
            }).catch(e => {
              console.log(e);
              highlightErrorElements(input, waitObj, "Not executed", e, "-", boundaryEventType);
              throw e;
            })
        )
      }
      if (businessObj.type === 'sensor-sub') {
        let execArray = [];
        waitObj.environment.variables[currentDecisionID] = {};
        let values = businessObj.extensionElements?.values.filter(element => element['$type'] === 'iot:Properties')[0].values;
        values.forEach(value => {
          if (value.url && value.key && value.name) {
            let execElement = pool.exec('sensorCallGroup', [value.url, value.key, businessObj.id], {
              on: payload => {
                fillSidebarRightLog(payload.status);
              }
            }).then(result => {
              console.log("Result:");
              console.log(result);
              if (result.value) {
                waitObj.environment.variables[currentDecisionID][input.id] = {...waitObj.environment.variables[currentDecisionID][input.id], [value.name] : result.value };
              }
              highlightElement(input, "rgba(66, 180, 21, 0.7)");
              return result;
            }).catch(e => {
              console.log(e);
              highlightErrorElements(input, waitObj, "Not executed", e, "-", boundaryEventType);
              throw e;
            })
            execArray.push(execElement);
            workerArr.push(execElement)
          } else {
            console.log("SensorGroup: Key or URL incorrect / doesn't exist");
          }
        })
        Promise.allSettled(execArray).then((values) => {
          let rejected = values.filter(val => val.status === 'rejected');
          if (rejected.length === 0) {
            highlightElement(input, "rgba(66, 180, 21, 0.7)");
          } else {
            highlightErrorElements(input, waitObj, "Not executed", "ActorGroup error", "-", boundaryEventType);
          }
        });
      }
      if(businessObj.type === 'artefact-catch') {
        highlightElement(input, 'rgba(255, 143, 0, 1)')
        workerArr.push(
            pool.exec('sensorCatchArtefact', [businessObj, start_t, timeout], {
              on: payload => {
                fillSidebarRightLog(payload.status);
              }
            }).then(result => {
              console.log("Result:");
              console.log(result);
              if (result.value) {
                waitObj.environment.variables[input.id] = result.value;
              }
              highlightElement(input, "rgba(66, 180, 21, 0.7)");
              return result;
            }).catch(e => {
              console.log(e);
              highlightErrorElements(input, waitObj, "Not executed", e, "-", boundaryEventType);
              throw e;
            })
        )

      }
      if(businessObj.type === 'artefact-catch-sub') {
        let execArray = [];
        let values = businessObj.extensionElements?.values.filter(element => element['$type'] === 'iot:Properties')[0].values;
        values.forEach(value => {
          if (value.url && value.key && value.name) {
            let execElement = pool.exec('sensorCatchArtefactGroup', [value, businessObj.id, start_t, timeout], {
              on: payload => {
                fillSidebarRightLog(payload.status);
              }
            }).then(result => {
              console.log("Result:");
              console.log(result);
              if (result) {
                waitObj.environment.variables[input.id] = {...waitObj.environment.variables[input.id], [value.name] : result };
              }
              return result;
            }).catch(e => {
              console.log(e);
              throw e;
            })
            execArray.push(execElement);
            workerArr.push(execElement)
          } else {
            console.log("SensorGroup: Key or URL incorrect / doesn't exist");
          }
        })
        Promise.allSettled(execArray).then((values) => {
          let rejected = values.filter(val => val.status === 'rejected');
          if (rejected.length === 0) {
            highlightElement(input, "rgba(66, 180, 21, 0.7)");
          } else {
            highlightErrorElements(input, waitObj, "Not executed", "Sensor Catch Artefact Group error", "-", boundaryEventType);
          }
        });

      }
    })
  }

  const extractedOutputs = (iotOutputs, workerArr) => {
    iotOutputs.forEach(output => {
      let businessObj = getBusinessObject(output);

      if (businessObj.type === 'actor') {
        workerArr.push(
            pool.exec('actorCall', [businessObj], {
              on: payload => {
                fillSidebarRightLog(payload.status);
              }
            }).then(result => {
              console.log("Result:");
              console.log(result);
              highlightElement(output, "rgba(66, 180, 21, 0.7)");
              return result;
            }).catch(e => {
              highlightErrorElements(output, waitObj, "Not executed", e, "-", boundaryEventType);
              console.log(e);
              throw e;
            })
        )
      }
      if (businessObj.type === 'actor-sub') {
        let execArray = [];
        let values = businessObj.extensionElements?.values.filter(element => element['$type'] === 'iot:Properties')[0].values;
        values.forEach(value => {
          let execElement = pool.exec('actorCallGroup', [value.url, value.method, businessObj.id], {
            on: payload => {
              fillSidebarRightLog(payload.status);
            }
          }).then(result => {
            console.log("Result:");
            console.log(result);
            return result;
          }).catch(e => {
            console.log(e);
            throw e;
          })
          execArray.push(execElement);
          workerArr.push(execElement);
        })
        Promise.allSettled(execArray).then((values) => {
          let rejected = values.filter(val => val.status === 'rejected');
          if (rejected.length === 0) {
            highlightElement(output, "rgba(66, 180, 21, 0.7)");
          } else {
            highlightErrorElements(output, waitObj, "Not executed", "ActorGroup error", "-", boundaryEventType);
          }
        });
      }
      //TODO: handle obj the right way. Currently it acts as an actor
      if (businessObj.type === 'obj') {
        workerArr.push(
            pool.exec('actorCall', [businessObj], {
              on: payload => {
                fillSidebarRightLog(payload.status);
              }
            }).then(result => {
              console.log("Result:");
              console.log(result);
              highlightElement(output, "rgba(66, 180, 21, 0.7)");
              return result;
            }).catch(e => {
              highlightErrorElements(output, waitObj, "Not executed", e, "-", boundaryEventType);
              console.log(e);
              throw e;
            })
        )
      }
    })
  }

  // Werte senoren aus
  const extractedDecision = (iotInputs, workerArr, currentDecisionID) => {
    iotInputs.forEach(input => {
      let businessObj = getBusinessObject(input);

      if (businessObj.type === 'sensor') {
        //speichere alle sensor promises u
        workerArr.push(
            pool.exec('sensorCall', [businessObj], {
              on: payload => {
                fillSidebarRightLog(payload.status);
              }
            }).then(result => {
              console.log("Result:");
              console.log(result);
              if (result.value) {
                //speichere ergebnis von sensor in objekt mit der id des containers bspw a:{sensor1: 300} zugriff dann a.sensor1
                waitObj.environment.variables[currentDecisionID] = {...waitObj.environment.variables[currentDecisionID], [input.id] : result.value };
              }
              highlightElement(input, "rgba(66, 180, 21, 0.7)");
              //return result;
            }).catch(e => {
              console.log(e);
              highlightErrorElements(input, waitObj, "Not executed", e, "-", boundaryEventType);
              throw e;
            })
        )
      }
      if (businessObj.type === 'sensor-sub') {
        let execArray = [];
        waitObj.environment.variables[currentDecisionID] = {};
        let values = businessObj.extensionElements?.values.filter(element => element['$type'] === 'iot:Properties')[0].values;
        values.forEach(value => {
          if (value.url && value.key && value.name) {
            let execElement = pool.exec('sensorCallGroup', [value.url, value.key, businessObj.id], {
              on: payload => {
                fillSidebarRightLog(payload.status);
              }
            }).then(result => {
              console.log("Result:");
              console.log(result);
              if (result.value) {
                waitObj.environment.variables[input.id] = {...waitObj.environment.variables[input.id], [value.name] : result.value };
              }
              highlightElement(input, "rgba(66, 180, 21, 0.7)");
              return result;
            }).catch(e => {
              console.log(e);
              highlightErrorElements(input, waitObj, "Not executed", e, "-", boundaryEventType);
              throw e;
            })
            execArray.push(execElement);
            workerArr.push(execElement);
          } else {
            console.log("SensorGroup: Key or URL incorrect / doesn't exist");
          }
        })
        Promise.allSettled(execArray).then((values) => {
          let rejected = values.filter(val => val.status === 'rejected');
          if (rejected.length === 0) {
            highlightElement(input, "rgba(66, 180, 21, 0.7)");
          } else {
            highlightErrorElements(input, waitObj, "Not executed", "ActorGroup error", "-", boundaryEventType);
          }
        });
      }
    })
  }

  const extractedPromise = (workerArr) => {
    Promise.allSettled(workerArr).then((values) => {
      console.log(values);
      let rejected = values.filter(val => val.status === 'rejected');
      if (rejected.length === 0) {
        waitObj.signal();
      }
    }).catch((e) => console.log(e));
  }

  // evaluiert alle Entscheidungen eines Containers schreibt das Ergebnis in die Umgebungsvariabeln und gibt das Ergebnis als Objekt zurück
  const evalDecision = (currentShape) => {
    // filtere alle Entscheidungen heraus und schreibe sie einzeln in ein array
    let values = currentShape.businessObject.extensionElements?.values.filter(element => element['$type'] === 'iot:Properties')[0].values;
    // iteriere über jede Entscheidung
    values.forEach(value => {
      // Werte die Entscheidung nur aus wenn Bedingung und name gegeben sind
      if (value.name && value.condition) {
        // beliebige "buchstaben" "zahlen" "-" "_" Kombination bis ein Punkt kommt dann selbe Kombin nochmal gm -> global multiline
        // hier wird nur die Zugriffe auf die Umgebungsvariabeln geholt bsp. container1.sensor_a
        let regex = /[a-zA-Z0-9_\-]*[.][a-zA-Z0-9_\-]*/gm;
        let stringForRegex = value.condition;
        let parsedVariableArray = stringForRegex.match(regex);
        // zugriffe werden am punkt gesplittet und diese dann als string mit eckigen klammern versehen
        let replacedArray = parsedVariableArray.map((str) => {
          let partElement = "";
          let keyArr = str.split('.');
          keyArr.forEach(k => {
            partElement += "['"+k+"']";
          });
          // dynamischer zugriff auf umgebungsvariabeln
          return "waitObj['environment']['variables']"+partElement;
        })

        //ersetzen aller conditions zur Klammerform bsp. container.a => waitObj['environment']['variables']['container']['a']
        replacedArray.forEach((match, groupIndex) => {
          stringForRegex = stringForRegex.replace( /[a-zA-Z0-9_\-]*[.][a-zA-Z0-9_\-]*/, match);
        })
        //auswerten der condition durch eval und anschließend ergebnis an das objekt hängen
        waitObj.environment.variables[currentShape.id] = {...waitObj.environment.variables[currentShape.id], [value.name] : eval(stringForRegex) };
      }
    })
    console.log(waitObj.environment.variables)
    // objekt zurückgeben
    return waitObj.environment.variables[currentShape.id];
  }

  const getTreeResult = (treeNode) => {
    // dort werden alle Promises der (möglichen) Kinder gespeichert.
    let childrenPromises = [];
    // speichert alle Promises der Sensorabfragen
    const workerArrDecision = [];

    // Diese Funktion gibt ein Promise zurück nachem alle Entscheidungen im Container ausgewertet wurden
    // entweder positiv oder negativ als error falls ein sensor fehlgeschlagen ist
    const extractedDecisionSeatteldPromise = () => {
      // gibt Promise zurück wie bereits geschrieben
      return Promise.allSettled(workerArrDecision).then((values) => {
        // filtert heraus ob fehler beim sensor call passiert ist (wird im worker als reject markiert falls exceptioin dort fliegt)
        let rejected = values.filter(val => val.status === 'rejected');
        // wenn keine fehler
        if (rejected.length === 0) {
          //successful
          // werte die Bedingungen der container aus und erhalte ERgebnis in Form von einem Objekt
          let decisionResult = evalDecision(treeNode.value);
          // overlay zeug
          addOverlaysDecision(treeNode.value, decisionResult);
          addOverlaysResult(treeNode.value, decisionResult);
          // grün markieren
          highlightElement(treeNode.value, "rgba(66, 180, 21, 1.0)");
          // erfolgs promise zurück geben
          return new Promise(resolve => resolve("succsess"));
        } else {
          //fail
          // rot markieren
          highlightErrorElements(treeNode.value, waitObj, "Not executed", "error", "-", []);
          // error promise zurück geben
          return new Promise((resolve, reject) => reject(new Error(id)));
        }
      })
    }

    //extrahiere alle Sensoren + Sensore groups
    let iotInputs = treeNode.value.children.map(input => {
      if (input.businessObject.type === 'sensor' || input.businessObject.type === 'sensor-sub') {
        return bpmnViewer.get('elementRegistry').find(element => element.id === input.id);
      }
    }).filter(e => e !== undefined);
    console.log(iotInputs);

    //falls dieser Knoten Kinder hat
    if(treeNode.descendants.length > 0) {

      // iteriere über alle Kinder
      treeNode.descendants.forEach(x => {
        // fülle das childrenPromise array auf mit allen Kinderpromises und rufe auf den Kindern nochmal die Auswertungsfunktion auf (rekursion)
        childrenPromises.push(getTreeResult(x));
      })
      // sobald alle Kinder ihre Promises ergebnisse zurück geliefert haben wird das hier ausgeführt
      return Promise.allSettled(childrenPromises).then((values) => {
        // filtere ob fehler aufgetreten bei den Kindern
        let rejected = values.filter(val => val.status === 'rejected');

        // falls keine Fehler
        if (rejected.length === 0) {
          // markiere diesen container orange
          highlightElement(treeNode.value, 'rgba(255, 143, 0, 1)');
          // Rufe Auswertung der Sensoren auf
          extractedDecision(iotInputs, workerArrDecision, treeNode.value.id);
          // gibt am schluss ergebnis zurück an task/oder elternknoten der auf die kinderergebnisse wartet
          return extractedDecisionSeatteldPromise();
          //falls fehler
        } else {
          //fail
          console.log("FAIL");
          // färbe rot
          highlightElement(treeNode.value, "rgb(245,61,51)");
          // Gehe durch jeden fehler und pack den in das seitliche LOG
          rejected.forEach(rej => fillSidebarRightLog("msg: " + rej.reason.message + ", stack: " + rej.reason.stack))
          // gibt am schluss ergebnis zurück an task/oder elternknoten der auf die kinderergebnisse wartet auswertung von container wird nicht gemacht da exception aufgetreten
          return new Promise((resolve,reject) => reject(new Error(id)));
        }
      });
      // falls dieser Knoten keine kinder hat
    } else {
      // markiere diesen Container orange
      highlightElement(treeNode.value, 'rgba(255, 143, 0, 1)');
      // Rufe Auswertung der Sensoren auf
      extractedDecision(iotInputs, workerArrDecision, treeNode.value.id);
    }
    // gibt am schluss ergebnis zurück an task/oder elternknoten der auf die kinderergebnisse wartet
    return extractedDecisionSeatteldPromise();
  }


  if(task) {
    const workerArr = [];
    let businessObj = getBusinessObject(task);

    let iotDecisionGroup = businessObj.get("dataInputAssociations")?.map(input => {
      if (input.sourceRef[0].type && input.sourceRef[0].type === 'decision-group') {
        return bpmnViewer.get('elementRegistry').find(element => element.id === input.sourceRef[0].id);
      }
    }).filter(e => e !== undefined);
    let iotInputs = businessObj.get("dataInputAssociations")?.map(input => {
      if (input.sourceRef[0].type && input.sourceRef[0].type !== 'decision-group') {
        return bpmnViewer.get('elementRegistry').find(element => element.id === input.sourceRef[0].id);
      }
    }).filter(e => e !== undefined);
    let iotOutputs = businessObj.get("dataOutputAssociations")?.map(input => {
      if(input.targetRef.type) {
        return bpmnViewer.get('elementRegistry').find(element => element.id === input.targetRef.id);
      }
    }).filter(e => e !== undefined);

    if(iotDecisionGroup.length > 0) {
      highlightElement(task, 'rgba(255, 143, 0, 1)');
      let x = createTree(iotDecisionGroup[0]);
      //console.log(x);

      getTreeResult(x).then((val) => {
        waitObj.signal();
      }).catch(xy => {
        engine.stop();
      });
    }

    if(iotInputs.length === 0 && iotOutputs.length === 0 && iotDecisionGroup.length === 0){
      waitObj.signal();
    } else {
      highlightElement(task, 'rgba(255, 143, 0, 1)');
    }
    if(iotInputs.length > 0 && iotOutputs.length === 0) {
      // run registered functions on the worker via exec
      extractedInputs(iotInputs, workerArr);
      extractedPromise(workerArr);
    }

    if(iotOutputs.length > 0 && iotInputs.length === 0) {
      extractedOutputs(iotOutputs, workerArr);
      extractedPromise(workerArr);
    }

    if (iotOutputs.length > 0 && iotInputs.length > 0) {
      extractedInputs(iotInputs, workerArr);
      extractedOutputs(iotOutputs, workerArr);
      extractedPromise(workerArr);
    }
  }
})

const createTree = (shape) => {
  let mainNode = new TreeNode(shape);

  if(shape.children.length > 0) {
    shape.children.forEach(childNode => {
      if(childNode.type === 'bpmn:SubProcess') {
        mainNode.descendants.push(createTree(childNode));
      }
    })
  }
  return mainNode;
}

listener.on('activity.end', (element)=>{
  end_t = new Date().getTime();
  let time = end_t - start_t;

  console.log("EXECUTION TIME: "+ time);
  fillSidebarRightLog("EXECUTION TIME: " + time + " ms");


  let currentElement = bpmnViewer.get('elementRegistry').find((elem)=>elem.id === element.id);
  let businessObj = getBusinessObject(currentElement) ? getBusinessObject(currentElement) : null;
  let timeStamp = timestampToDate(element.messageProperties.timestamp);
  let obj = element.content.inbound;

  if(businessObj?.type === 'end') {
    const workerArr = [];
    workerArr.push(
      pool.exec('actorCall', [businessObj], {
        on: payload => {
          fillSidebarRightLog(payload.status);
        }
      }).then(result => {
        let end_t_1 = new Date().getTime();
        let _time = end_t_1 - start_t;
        console.log("Result:");
        console.log(result);
        highlightElement(currentElement, "rgba(66, 180, 21, 0.7)");
        addOverlays(currentElement, _time);
        fillSidebar(confirmIcon, element.name, element.id, _time, timeStamp, 'bpmn:IoTEndEvent', "-", obj ? obj[0].sourceId : '-');
        return result;
      }).catch(e => {
        let end_t_1 = new Date().getTime();
        let _time = end_t_1 - start_t;
        highlightErrorElements(null, element, "Not executed", e, "-", []);
        addOverlays(currentElement, _time);
        console.log(e);
        throw e;
      })
    )
  } else {
    if(businessObj?.type !== 'decision-group') {
      highlightElement(currentElement, "rgba(66, 180, 21, 0.7)");
      addOverlays(currentElement, time);
      fillSidebar(confirmIcon, element.name, element.id, time, timeStamp, element.type, "-", obj ? obj[0].sourceId : '-');
    }
  }

  // -----------------
  executedTasksArr.push(element.id);

  let taskArr = bpmnViewer.get('elementRegistry').filter(element => is(element, "bpmn:Task"));
  let task = taskArr.find(task => task.id === element.id);
  if(task) {
    let businessObj = getBusinessObject(task);
    let iotInputs = businessObj.get("dataInputAssociations")?.map(input => {
      if (input.sourceRef[0].type) {
        let elementToColor = bpmnViewer.get('elementRegistry').find(element => element.id === input.sourceRef[0].id);
        highlightElement(elementToColor, "rgba(66, 180, 21, 1)");
        return input.sourceRef[0].id;
      }
    });
    let iotOutputs = businessObj.get("dataOutputAssociations")?.map(input => {
      if(input.targetRef.type) {
        let elementToColor = bpmnViewer.get('elementRegistry').find(element => element.id === input.targetRef.id);
        highlightElement(elementToColor, "rgba(66, 180, 21, 1)");
        return input.targetRef.id;
      }
    });
    executedTasksArr.push(...iotInputs);
    executedTasksArr.push(...iotOutputs);
  }
})

const throwError = (api, id, msg) => {
  // Code um einen Boundary-Error zu "thrown"
  //api.owner.emitFatal({id: 'SomeId', message: 'thrown in wait'}, {id: waitObj.id});
  api.owner.emitFatal({id: id, message: msg}, {id: api.id});
}

const highlightErrorElements = (iotArtifact, waitObj, time, errormsg, source, boundary) => {
  if(boundary.length === 0) {
    engine.stop();
  }

  let element = bpmnViewer.get('elementRegistry').find(e => e.id === waitObj.id);

  if(iotArtifact) {
    let iotArtifactElement = bpmnViewer.get('elementRegistry').find(e => e.id === iotArtifact.id);
    highlightElement(iotArtifactElement, "rgb(245,61,51)");
  }
  highlightElement(element, "rgb(245,61,51)");
  let convertedTimeStamp = timestampToDate(waitObj.messageProperties.timestamp);
  fillSidebar(errIcon, waitObj.name, waitObj.id, time, convertedTimeStamp, waitObj.type, errormsg, source);
}

const timestampToDate = (timestamp) => {
  let date = new Date(timestamp);
  let convertTimestamp = date.getDate()+
      "/"+(date.getMonth()+1)+
      "/"+date.getFullYear()+
      " "+date.getHours()+
      ":"+(date.getMinutes()<10?'0':'') + date.getMinutes();

  return convertTimestamp;
}

function fillSidebarRightLog(msg) {
  let table = document.getElementById("overlayTableLogRight").getElementsByTagName("tbody")[0];
  let tableLength = table.rows.length;
  let row;
  if(tableLength > 100) {
    table.deleteRow(0);
    row = table.insertRow(tableLength -1);
  } else {
    row = table.insertRow(tableLength);
  }

  let text = row.insertCell(0);
  text.innerHTML = msg;

  scrollLogToBottom();
}

const scrollLogToBottom = () => {
  let div = document.getElementById("logDiv");
  div.scrollTop = div.scrollHeight - div.clientHeight;
}


function fillSidebar(state, name, id, time, timeStamp,type, errormsg, source) {
  let table = document.getElementById("overlayTable").getElementsByTagName("tbody")[0];
  let tableLength = table.rows.length;
  let row = table.insertRow(tableLength);
  row.classList.add("text-center");

  let stateCell = row.insertCell(0);
  let nameCell = row.insertCell(1);
  let idCell = row.insertCell(2);
  let typeCell = row.insertCell(3);
  let sourceCell = row.insertCell(4);
  let startTimeCell = row.insertCell(5);
  let executionTimeCell = row.insertCell(6);
  let errorMsgCell = row.insertCell(7);


  stateCell.innerHTML = state;
  nameCell.innerHTML = name ? name : '-';
  idCell.innerHTML = id;
  typeCell.innerHTML = type;
  sourceCell.innerHTML = source;
  startTimeCell.innerHTML = timeStamp;
  executionTimeCell.innerHTML = time/1000 + " s";
  errorMsgCell.innerHTML = errormsg;
}

const addOverlaysResult = (elem, states) => {
  let values = elem.businessObject.extensionElements?.values.filter(element => element['$type'] === 'iot:Properties')[0].values;
  let valuesName = values.map(val => val.name);
  let spanStates="";

  for (const [key, value] of Object.entries(states)) {
    if(typeof value == "object") {
      for (const [_key, _value] of Object.entries(value)) {
        spanStates = spanStates + `<li class="list-group-item ${valuesName.includes(_key) ? 'item-active' : ''}">${key + '.' + _key}: ${_value}</li>`;
      }
    } else {
      if(!key.includes("label") && valuesName.includes(key)) {
        let x = values.find(val => val.name === key);
        spanStates = spanStates + `<li class="list-group-item ${valuesName.includes(key) ? (value ? 'item-success' : 'item-error') : ''}">${key}: ${value}</li>`;
      }
    }
  }

  let decisionLog = document.getElementById("decisionLog");
  decisionLog.innerHTML += '<ul id="res-'+elem.id+'" style="display: none" class="ttooltiptext">'+ spanStates + '</ul>';
  let resOverlay = document.createElement('div');
  resOverlay.className = "result-overlay";
  resOverlay.innerText = "Results";

  resOverlay.addEventListener('mouseover', (event)=>{
    console.log(decisionLog.children);
    for (let i = 0; i < decisionLog.children.length; i++) {
      decisionLog.children[i].style.display = "none";
    }
    document.getElementById("res-"+elem.id).style.display = "block";
  });

  resOverlay.addEventListener('mouseleave', (event)=>{
    console.log(decisionLog.children);
    for (let i = 0; i < decisionLog.children.length; i++) {
      decisionLog.children[i].style.display = "none";
    }
  });

  overlays.add(elem, {
    html: resOverlay,
    position: {
      right: 55,
      top: 0
    }
  });
}


const addOverlaysDecision = (elem, states) => {
  let values = elem.businessObject.extensionElements?.values.filter(element => element['$type'] === 'iot:Properties')[0].values;
  let valuesName = values.map(val => val.name);
  let spanStates="";

  for (const [key, value] of Object.entries(states)) {
    if(typeof value == "object") {
      for (const [_key, _value] of Object.entries(value)) {
        spanStates = spanStates + `<li class="list-group-item ${valuesName.includes(_key) ? 'item-active' : ''}">${key + '.' + _key}: ${_value}</li>`;
      }
    } else {
      if(!key.includes("label")) {
        let x = values.find(val => val.name === key);
        spanStates = spanStates + `<li class="list-group-item ${valuesName.includes(key) ? (value ? 'item-success' : 'item-error') : ''}">${x?.condition ? x.condition + '<b> => </b>' : ''}  ${key}: ${value}</li>`;
      }
    }
  }

  let decisionLog = document.getElementById("decisionLog");
  decisionLog.innerHTML += '<ul id="dec-'+elem.id+'" style="display: none" class="ttooltiptext">'+ spanStates + '</ul>';
  let decOverlay = document.createElement('div');
  decOverlay.className = "decision-overlay";
  decOverlay.innerText = "Decision";

  decOverlay.addEventListener('mouseover', (event)=>{
    console.log(decisionLog.children);
    for (let i = 0; i < decisionLog.children.length; i++) {
      decisionLog.children[i].style.display = "none";
    }
    document.getElementById("dec-"+elem.id).style.display = "block";
  });

  decOverlay.addEventListener('mouseleave', (event)=>{
    console.log(decisionLog.children);
    for (let i = 0; i < decisionLog.children.length; i++) {
      decisionLog.children[i].style.display = "none";
    }
  });

  overlays.add(elem, {
    html: decOverlay,
    position: {
      left: 0,
      top:0
    }
  });
};

const addOverlays = (elem, time) => {
  overlays.add(elem, {
    html: '<div class="overlay">Time:'+ time/1000+' s</div>',
    position: {
      left: 0,
      top:0
    }
  });
};

const highlightElement = (elem, colorStr) => {
  elem.businessObject.di.set("fill", colorStr);
  const gfx = bpmnViewer.get("elementRegistry").getGraphics(elem);
  const type = elem.waypoints ? "connection" : "shape";
  bpmnViewer.get("graphicsFactory").update(type, elem, gfx);
};

const highlightElementArr = (elementArr, colorStr) => {
  elementArr.forEach((elem)=>highlightElement(elem, colorStr));
}

const resetView = () => {
  // clear executed task array
  executedTasksArr.length = 0;
  // Alle BPMN Elemente aus der elementRegistry holen
  let allElements = bpmnViewer.get('elementRegistry').filter((elem)=>elem.id);
  overlays.clear()
  // Schleife um alle BPMN Elemente wieder mit der Standardfarbe zu färben
  highlightElementArr(allElements, "rgba(255,255,255,1.0)")

  document.getElementById("tableBody").innerHTML = "";
  document.getElementById("tableBodyLogRight").innerHTML = "";
}

runBtn.addEventListener('click', (event)=>{
  document.getElementById("mySidebarLog").style.display = "block";
  resetView();

  engine.execute({listener}).catch(e=>console.log(e));
})


document.getElementById('openbtn').addEventListener('click', (event)=>{
  document.getElementById("mySidebar").style.display = "block";
  document.getElementById("mySidebarLog").style.display = "none";
})

/* Set the width of the sidebar to 0 and the left margin of the page content to 0 */
document.getElementById('closebtn').addEventListener('click', (event)=>{
  document.getElementById("mySidebar").style.display = "none";
})

document.getElementById('closebtnRight').addEventListener('click', (event)=>{
  document.getElementById("mySidebarLog").style.display = "none";
})
