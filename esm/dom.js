function isPlainObject(obj) {
    return typeof obj === 'object' &&
        obj !== null &&
        !Array.isArray(obj) &&
        Object.getPrototypeOf(obj) === Object.prototype;
}

const objectStateMap = new WeakMap();
function defineStatefulProperty(object, propertyKey, valueHandler, defaultExecute = true) {
    if (!objectStateMap.has(object)) {
        objectStateMap.set(object, { stateChangeHandlers: {} });
    }
    if (!(propertyKey in object) || isPropertyConfigurable(object, propertyKey)) {
        let propertyValue = object[propertyKey];
        delete object[propertyKey];
        Object.defineProperty(object, propertyKey, {
            get: () => propertyValue,
            set: (value) => {
                var _a, _b;
                if (value !== propertyValue) {
                    const previousValue = propertyValue;
                    propertyValue = value;
                    (_b = (_a = objectStateMap.get(object)) === null || _a === void 0 ? void 0 : _a.stateChangeHandlers[propertyKey]) === null || _b === void 0 ? void 0 : _b.forEach(handler => handler(previousValue));
                }
            }
        });
    }
    if (defaultExecute)
        valueHandler(object[propertyKey], object[propertyKey]);
    if (!(propertyKey in objectStateMap.get(object).stateChangeHandlers)) {
        objectStateMap.get(object).stateChangeHandlers[propertyKey] = [];
    }
    function stateChangeHandler(previousValue) {
        valueHandler(object[propertyKey], previousValue);
    }
    objectStateMap.get(object).stateChangeHandlers[propertyKey].push(stateChangeHandler);
    return {
        delete: function () {
            let handlers = objectStateMap.get(object).stateChangeHandlers[propertyKey];
            let handlerIndex = handlers.indexOf(stateChangeHandler);
            if (handlerIndex >= 0)
                handlers.splice(handlerIndex, 1);
            if (!handlers.length) {
                delete objectStateMap.get(object).stateChangeHandlers[propertyKey];
            }
            if (!Object.keys(objectStateMap.get(object).stateChangeHandlers).length) {
                objectStateMap.delete(object);
            }
        }
    };
}
function isPropertyConfigurable(targetObject, propertyKey) {
    const descriptor = Object.getOwnPropertyDescriptor(targetObject, propertyKey);
    return descriptor ? Boolean(descriptor.configurable) : false;
}

const DOMStateList = new WeakMap();
class DOMState {
    constructor(trackList, callback) {
        this.trackList = trackList;
        this.callback = callback;
        DOMStateList.set(this, []);
    }
    unbind() {
        const deleteList = DOMStateList.get(this);
        if (!deleteList)
            return void 0;
        deleteList.forEach(stateDelete => stateDelete());
        deleteList.splice(0, deleteList.length);
        DOMStateList.delete(this);
    }
    ref(object, key) {
        object[key ? key : 'current'] = this;
    }
}
function __bindDOMState(domState, callback) {
    const values = [];
    const previousValues = [];
    domState.trackList.forEach((trackItem, index) => {
        Object.entries(trackItem).forEach(([trackItemKey, trackItemObject]) => {
            var _a;
            values.push(trackItemObject[trackItemKey]);
            const addedState = defineStatefulProperty(trackItemObject, trackItemKey, (value, previousValue) => {
                values[index] = value;
                previousValues[index] = previousValue;
                callback(values, previousValues);
            }, false);
            (_a = DOMStateList.get(domState)) === null || _a === void 0 ? void 0 : _a.push(addedState.delete);
        });
    });
    callback(values, previousValues);
}
function bindState(trackList, callback) {
    return new DOMState(trackList, callback);
}
function unbindState(domState) {
    domState.unbind();
}

function append(targetParent, ...childNodes) {
    if (!targetParent)
        return targetParent;
    const filteredChildArray = childNodes
        .map((item) => {
        return typeof item === 'number' ? item.toString() : item;
    }).map((item) => {
        if (item instanceof DOMState) {
            let node = null;
            __bindDOMState(item, (values, previousValues) => {
                const result = item.callback(values, previousValues);
                if (result === undefined || result === null || typeof result === 'boolean') {
                    const comment = document.createComment("");
                    if (node !== null)
                        node.replaceWith(comment);
                    node = comment;
                }
                else if (typeof result === 'string' || typeof result === 'number') {
                    const text = new Text(result.toString());
                    if (node !== null)
                        node.replaceWith(text);
                    node = text;
                }
                else {
                    if (node !== null)
                        node.replaceWith(result);
                    node = result;
                }
            });
            return node;
        }
        else {
            return item;
        }
    })
        .filter((item) => {
        return item !== undefined && item !== null && typeof item !== 'boolean';
    });
    targetParent.append(...filteredChildArray);
    return targetParent;
}

function findPropertyDescriptor(obj, prop) {
    while (obj) {
        const descriptor = Object.getOwnPropertyDescriptor(obj, prop);
        if (descriptor) {
            return descriptor;
        }
        obj = Object.getPrototypeOf(obj);
    }
    return null;
}
function parseTagDescriptor(descriptor) {
    const tagMatches = descriptor.match(/^(\w+)/);
    const classMatches = descriptor.matchAll(/\.([\w-]+)(?![^\[]*\])/g);
    const idMatches = descriptor.matchAll(/#([\w\s-]+)/g);
    const attrMatches = descriptor.matchAll(/\[([\w-]+)(?:=("|')?(.*?)\2?)?\]/g);
    const classes = Array.from(classMatches).map(match => match[1]);
    const ids = Array.from(idMatches).map(match => match[1].trim());
    const attrs = {};
    for (const match of attrMatches) {
        attrs[match[1]] = match[3] || '';
    }
    return {
        tag: (tagMatches ? tagMatches[1] : 'div'),
        class: classes,
        id: ids,
        attrs
    };
}

function createElement(descriptor, config) {
    const { tag, class: classes, id, attrs } = parseTagDescriptor(descriptor);
    const element = document.createElement(tag);
    if (classes.length > 0) {
        element.classList.add(...classes);
    }
    if (id.length > 0) {
        const validId = id.find(id => id && !/\s/.test(id));
        if (validId)
            element.id = validId;
    }
    for (const [attr, value] of Object.entries(attrs)) {
        element.setAttribute(attr, value);
    }
    const customConfig = {
        attributes(value) {
            applyDynamicOrStatic(value, element, (el, val) => {
                Object.entries(val).forEach(([key, val]) => {
                    el.setAttribute(key, val);
                });
            });
        },
        '[]': (value) => {
            customConfig.attributes(value);
        },
        '.': (value) => {
            applyDynamicOrStatic(value, element, (el, val) => {
                el.className = val;
            });
        },
        '#': (value) => {
            applyDynamicOrStatic(value, element, (el, val) => {
                el.id = val;
            });
        },
        html(value) {
            applyDynamicOrStatic(value, element, (el, val) => {
                el.innerHTML = val;
            });
        },
        text(value) {
            applyDynamicOrStatic(value, element, (el, val) => {
                el.textContent = val;
            });
        },
        style(value) {
            applyDynamicOrStatic(value, element, (el, val) => {
                Object.entries(val).forEach(([property, value]) => {
                    el.style.setProperty(property.startsWith('--') ? property :
                        property.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`), value);
                });
            });
        },
        fallbackSrc(fallbackImageSource) {
            if (element instanceof HTMLImageElement && fallbackImageSource) {
                const handleError = () => {
                    element.removeEventListener('error', handleError);
                    element.src = fallbackImageSource;
                };
                element.addEventListener('error', handleError);
            }
        },
    };
    if (config) {
        Object.entries(config).forEach(([key, value]) => {
            if (key in customConfig) {
                customConfig[key](value);
                return;
            }
            const descriptor = findPropertyDescriptor(element, key);
            if (descriptor === null || descriptor === void 0 ? void 0 : descriptor.set) {
                applyDynamicOrStatic(value, element, (el, val) => {
                    el[key] = val;
                });
            }
        });
    }
    return element;
}
function applyDynamicOrStatic(value, element, setter) {
    if (value instanceof DOMState) {
        __bindDOMState(value, (values, previousValues) => {
            const result = value.callback(values, previousValues);
            setter(element, result);
        });
    }
    else {
        setter(element, value);
    }
}

function elementFactory(tagName) {
    return function (configOrNode, ...nodes) {
        const selector = typeof configOrNode === 'string' ? configOrNode : '';
        const config = isPlainObject(configOrNode) ? configOrNode : undefined;
        const element = createElement(`${tagName}${selector}`, config);
        const childNodes = [...((!configOrNode || selector || config) ? [] : [configOrNode]), ...nodes];
        append(element, ...childNodes);
        return element;
    };
}
const Abbr = elementFactory('abbr');
const Address = elementFactory('address');
const Anchor = elementFactory('a');
const Area = elementFactory('area');
const Article = elementFactory('article');
const Aside = elementFactory('aside');
const AudioElement = elementFactory('audio');
const B = elementFactory('b');
const Base = elementFactory('base');
const Bdi = elementFactory('bdi');
const Bdo = elementFactory('bdo');
const Blockquote = elementFactory('blockquote');
const Body = elementFactory('body');
const Br = elementFactory('br');
const Button = elementFactory('button');
const Canvas = elementFactory('canvas');
const Caption = elementFactory('caption');
const Cite = elementFactory('cite');
const Code = elementFactory('code');
const Col = elementFactory('col');
const Colgroup = elementFactory('colgroup');
const Data = elementFactory('data');
const Datalist = elementFactory('datalist');
const Dd = elementFactory('dd');
const Del = elementFactory('del');
const Details = elementFactory('details');
const Dfn = elementFactory('dfn');
const Dialog = elementFactory('dialog');
const Div = elementFactory('div');
const Dl = elementFactory('dl');
const Dt = elementFactory('dt');
const Em = elementFactory('em');
const Embed = elementFactory('embed');
const Fieldset = elementFactory('fieldset');
const Figcaption = elementFactory('figcaption');
const Figure = elementFactory('figure');
const Footer = elementFactory('footer');
const Form = elementFactory('form');
const H1 = elementFactory('h1');
const H2 = elementFactory('h2');
const H3 = elementFactory('h3');
const H4 = elementFactory('h4');
const H5 = elementFactory('h5');
const H6 = elementFactory('h6');
const Head = elementFactory('head');
const Header = elementFactory('header');
const Hgroup = elementFactory('hgroup');
const Hr = elementFactory('hr');
const Html = elementFactory('html');
const I = elementFactory('i');
const Iframe = elementFactory('iframe');
const Img = elementFactory('img');
const Input = elementFactory('input');
const Ins = elementFactory('ins');
const Kbd = elementFactory('kbd');
const Label = elementFactory('label');
const Legend = elementFactory('legend');
const Li = elementFactory('li');
const LinkElement = elementFactory('link');
const Main = elementFactory('main');
const MapElement = elementFactory('map');
const Mark = elementFactory('mark');
const Menu = elementFactory('menu');
const Meta = elementFactory('meta');
const Meter = elementFactory('meter');
const Nav = elementFactory('nav');
const Noscript = elementFactory('noscript');
const ObjectElement = elementFactory('object');
const Ol = elementFactory('ol');
const Optgroup = elementFactory('optgroup');
const OptionElement = elementFactory('option');
const Output = elementFactory('output');
const P = elementFactory('p');
const Picture = elementFactory('picture');
const Pre = elementFactory('pre');
const Progress = elementFactory('progress');
const Q = elementFactory('q');
const Rp = elementFactory('rp');
const Rt = elementFactory('rt');
const Ruby = elementFactory('ruby');
const S = elementFactory('s');
const Samp = elementFactory('samp');
const Script = elementFactory('script');
const Section = elementFactory('section');
const Select = elementFactory('select');
const Small = elementFactory('small');
const Source = elementFactory('source');
const Span = elementFactory('span');
const Strong = elementFactory('strong');
const Style = elementFactory('style');
const StylesheetLink = (stylesheetPath) => LinkElement({ rel: 'stylesheet', href: stylesheetPath });
const Sub = elementFactory('sub');
const Summary = elementFactory('summary');
const Sup = elementFactory('sup');
const Table = elementFactory('table');
const TBody = elementFactory('tbody');
const Td = elementFactory('td');
const Template = elementFactory('template');
const Textarea = elementFactory('textarea');
const TFoot = elementFactory('tfoot');
const Th = elementFactory('th');
const THead = elementFactory('thead');
const Time = elementFactory('time');
const Title = elementFactory('title');
const Tr = elementFactory('tr');
const Track = elementFactory('track');
const U = elementFactory('u');
const Ul = elementFactory('ul');
const Var = elementFactory('var');
const Video = elementFactory('video');
const Wbr = elementFactory('wbr');
const Fragment = (...nodeList) => {
    return append(document.createDocumentFragment(), ...nodeList);
};
function TextNode(data) {
    return new Text(data);
}

function convertToKebabCase(str) {
    return str
        .replace(/(?<!^)([A-Z])/g, '-$1')
        .toLowerCase();
}

function clearContent(targetNode) {
    targetNode.textContent = '';
    return targetNode;
}
function addClass(targetElement, ...classNames) {
    classNames = classNames.map(className => className.split(' ')).flat(1).filter(className => !!className);
    targetElement.classList.add(...classNames);
    return targetElement;
}
function removeClass(targetElement, ...classNames) {
    classNames = classNames.map(className => className.split(' ')).flat(1).filter(className => !!className);
    targetElement.classList.remove(...classNames);
    return targetElement;
}
function innerHTML(targetElement, content) {
    targetElement.innerHTML = content;
    return targetElement;
}
function innerText(targetElement, textContent) {
    targetElement.innerText = textContent;
    return targetElement;
}
function setValue(targetElement, elementValue = '') {
    targetElement.value = elementValue;
    return targetElement;
}
function setAttribute(element, attributeOrMap, value) {
    if (typeof attributeOrMap === 'string' && value !== undefined) {
        element.setAttribute(attributeOrMap, value);
    }
    else if (typeof attributeOrMap === 'object') {
        for (let attributeKey in attributeOrMap) {
            element.setAttribute(attributeKey, attributeOrMap[attributeKey]);
        }
    }
    return element;
}
function applyStyle(targetElement, stylePropOrMap, styleValue) {
    let accumulatedStyles = '';
    if (typeof stylePropOrMap === 'string' && styleValue) {
        accumulatedStyles = `${convertToKebabCase(stylePropOrMap)}:${styleValue};`;
    }
    else if (typeof stylePropOrMap === 'object') {
        Object.entries(stylePropOrMap).forEach(([property, value]) => {
            accumulatedStyles += `${convertToKebabCase(property)}:${value};`;
        });
    }
    targetElement.style.cssText += accumulatedStyles;
    return targetElement;
}

function assembleDOM(root) {
    return (...children) => {
        recursivelyAppend(root, children);
    };
    function recursivelyAppend(parent, children) {
        if (Array.isArray(children)) {
            children.forEach((child, index) => {
                if (Array.isArray(child)) {
                    let subParent = getParentOf(index);
                    if (!subParent)
                        return void 0;
                    recursivelyAppend(subParent, child);
                }
                else {
                    recursivelyAppend(parent, child);
                }
            });
        }
        else {
            append(parent, children);
        }
        function getParentOf(index) {
            if (index < 0 || !Array.isArray(children))
                return null;
            let parent = children[index - 1];
            if (Array.isArray(parent))
                return getParentOf(index - 1);
            return parent;
        }
    }
}

export { Abbr, Address, Anchor, Area, Article, Aside, AudioElement, B, Base, Bdi, Bdo, Blockquote, Body, Br, Button, Canvas, Caption, Cite, Code, Col, Colgroup, Data, Datalist, Dd, Del, Details, Dfn, Dialog, Div, Dl, Dt, Em, Embed, Fieldset, Figcaption, Figure, Footer, Form, Fragment, H1, H2, H3, H4, H5, H6, Head, Header, Hgroup, Hr, Html, I, Iframe, Img, Input, Ins, Kbd, Label, Legend, Li, LinkElement, Main, MapElement, Mark, Menu, Meta, Meter, Nav, Noscript, ObjectElement, Ol, Optgroup, OptionElement, Output, P, Picture, Pre, Progress, Q, Rp, Rt, Ruby, S, Samp, Script, Section, Select, Small, Source, Span, Strong, Style, StylesheetLink, Sub, Summary, Sup, TBody, TFoot, THead, Table, Td, Template, TextNode, Textarea, Th, Time, Title, Tr, Track, U, Ul, Var, Video, Wbr, addClass, append, applyStyle, assembleDOM, bindState, clearContent, createElement, innerHTML, innerText, removeClass, setAttribute, setValue, unbindState };
