const apiBaseUrl = '%%API_BASE_URL%%';
const stackPageUrl = '%%STACK_PAGE_URL%%';

let stacks;
let tabindex = 1;

async function callApi(method, url, headers = {}, data) {
  Object.assign(headers, {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    //'Access-Control-Allow-Origin': '*',
    //'Connection': 'keep-alive',
    //'Acept-Encoding': 'gzip, deflate, br',
    //'USer-Agent': 'PostmanRuntime/7.26.8',
  });

  // Default options are marked with *
  const config = {
    method: method, // *GET, POST, PUT, DELETE, etc.
    /*
    mode: 'no-cors', // no-cors, *cors, same-origin
    cache: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
    credentials: 'same-origin', // include, *same-origin, omit
    */
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      //'Access-Control-Allow-Origin': '*',
      //'Connection': 'keep-alive',
      //'Host': 'k8s.devstats.cncf.io',
      //'Acept-Encoding': 'gzip, deflate, br',
      //'USer-Agent': 'PostmanRuntime/7.26.8',
    },
    /*
    redirect: 'follow', // manual, *follow, error
    referrerPolicy: 'strict-origin-when-cross-origin', // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
    */
  };

  if (data) config.body = JSON.stringify(data);

  const response = await fetch(url, config);
  if (!response.ok) {
    throw new Error("HTTP status " + response.status);
  }

  return response.json(); // parses JSON response into native JavaScript objects
}

function sortByName(a, b) {
  const aName = a.name.toLowerCase();
  const bName = b.name.toLowerCase();

  if (aName === bName) return 0;

  const aLatin = isLatinLetter(aName[0]);
  const bLatin = isLatinLetter(bName[0]);

  if (aLatin && !bLatin) return -1;
  else if (!aLatin && bLatin) return 1;

  return aName < bName ? -1 : 1;
}

function isLatinLetter(letter) {
  return letter.toUpperCase() !== letter.toLowerCase()
}

async function loadComponents() {
  const components = await callApi('GET', apiBaseUrl + '/components');
  components.sort(sortByName);
  return components.filter(component => component.short !== 'all');
}

async function loadComponentStacks() {
  stacks = await callApi('GET', apiBaseUrl + '/stacks/components');
  return stacks;
}

function appendElement(parent, tagName, attributes = {}) {
  const element = document.createElement(tagName);
  for (const key of Object.keys(attributes)) {
    element.setAttribute(key, attributes[key]);
  }
  parent.append(element);
  return element;
}

function resetPage() {
  document.body.innerHTML = '';
  tabindex = 1;
}

const title1 = appendElement(document.body, 'h2');
title1.innerHTML = 'Components stack';

const mainGrid1 = appendElement(document.body, 'div', {
  class: 'mainGrid',
});

const componentsButtonsGrid = appendElement(mainGrid1, 'div', {
  class: 'buttonsGrid',
});

const createButton = appendElement(componentsButtonsGrid, 'button');
createButton.innerHTML = 'Create';

const editButton = appendElement(componentsButtonsGrid, 'button');
editButton.innerHTML = 'Edit';

const deleteButton = appendElement(componentsButtonsGrid, 'button');
deleteButton.innerHTML = 'Delete';

const stacksList = appendElement(mainGrid1, 'div', {
  class: 'stacksList',
});

const stackLabel = appendElement(stacksList, 'label', {
  class: 'listLabel',
});
stackLabel.innerHTML = 'View stack :';

const pointer = createSelection(stacksList, 'stackSelect', loadComponentStacks, false, 'Loading...');

const itemsGrid = appendElement(mainGrid1, 'div', {
  class: 'itemsGrid',
});
itemsGrid.style.display = 'none';

const itemsLabel = appendElement(itemsGrid, 'label', {
  class: 'listLabel',
});
itemsLabel.style.paddingTop = '2px';
itemsLabel.innerHTML = 'Items :';

const itemsList = appendElement(itemsGrid, 'ul', {
  class: 'itemsList',
});

pointer.selection.main.lastElementChild.onclick = function (event) {
  const selected = getSelectedItems(pointer.selection)[0]
  if (selected) {
    const stack = stacks.filter(s => s.short === selected)[0];
    itemsList.innerHTML = '';
    for (const component of stack.components) {
      const li = appendElement(itemsList, 'li');
      li.innerHTML = `${component.svg}<text>${component.name}</text>`;
    }
    itemsGrid.style.display = 'grid';
  }
};

const title2 = appendElement(document.body, 'h2');
title2.innerHTML = 'Companies stack';

const companiesButtonsGrid = appendElement(document.body, 'div', {
  class: 'buttonsGrid',
});

function createSubGrid(parent, textLabel) {
  const subGrid = appendElement(parent, 'div', {
    class: 'subGrid',
  });

  const label = appendElement(subGrid, 'label');
  label.innerHTML = textLabel;

  return subGrid;
}

function getSelectedItems(selection) {
  return Array.from(selection.listElements).filter(element => element.className.indexOf('active') !== -1).map(element => element.getAttribute('data-value'));
}

function createSelection(parent, id, callback, multiple, placeholder, disabled = false) {
  const selectAttributes = {
    id: id,
  };
  if (multiple) {
    selectAttributes.multiple = '';
    selectAttributes.size = '1';
  }
  const select = appendElement(parent, 'select', selectAttributes);

  const selectionOptions = {
    search: true,
    maxHeight: 400,
    disableSelectAll: true,
  };

  if (placeholder) selectionOptions.placeHolder = placeholder;

  let multipleSelection = new vanillaSelectBox(`#${id}`, selectionOptions);
  multipleSelection.disable();
  const pointer = {};
  callback().then(function (values) {
    multipleSelection = pointer.selection;
    const listener = multipleSelection.main.lastElementChild.onclick;
    for (const value of values) {
      const option = document.createElement('option');
      option.setAttribute('value', value.short || value.name);
      option.innerHTML = value.name;
      select.append(option);
    }
    multipleSelection.destroy();

    if (values.length === 0) {
      disabled = true;
      selectionOptions.placeHolder = 'No stack found';
    }

    if (!disabled) selectionOptions.placeHolder = 'Select item';
    const localTabindex = multipleSelection.main.getAttribute('tabindex');
    multipleSelection = new vanillaSelectBox(`#${id}`, selectionOptions);
    multipleSelection.responseValues = values;
    multipleSelection.main.setAttribute('tabindex', localTabindex);
    if (disabled) {
      multipleSelection.disable();
      Array.from(multipleSelection.main.getElementsByTagName('button')).map(button => button.setAttribute('type', 'button'));
    } else {
      multipleSelection.main.lastElementChild.onclick = listener;
    }
    pointer.selection = multipleSelection;
  });

  Array.from(multipleSelection.main.getElementsByTagName('button')).map(button => button.setAttribute('type', 'button'));
  multipleSelection.main.setAttribute('tabindex', tabindex.toString());
  tabindex++;

  pointer.selection = multipleSelection;

  return pointer;
}

function createSubmitButton(parent, text) {
  const button = appendElement(parent, 'button', {
    id: 'submit',
    type: 'button',
    tabindex: tabindex,
  });
  tabindex++;
  button.innerHTML = text || 'Submit';

  return button;
}

function createLoading() {
  const div = document.createElement('div')
  div.setAttribute('class', 'lds-ring')
  div.style.justifySelf = 'center';
  for (let i = 0; i < 4; i++) div.append(document.createElement('div'))
  return div
}

function appendIconMessage(parent, iconClass, message) {
  const resultDiv = appendElement(parent, 'div', {
    class: 'resultDiv',
    id: 'result',
  });
  appendElement(resultDiv, 'div', {
    class: `icon ${iconClass}`,
  });
  const text = appendElement(resultDiv, 'text', {});
  text.innerHTML = message;

  return resultDiv;
}

createButton.onclick = function (event) {
  resetPage();

  const mainForm = appendElement(document.body, 'form', {
    class: 'mainForm',
  });

  const subGrid1 = createSubGrid(mainForm, 'Name :');
  const input = appendElement(subGrid1, 'input', {
    id: 'stackName',
    tabindex: tabindex.toString(),
  });
  tabindex++;

  const subGrid2 = createSubGrid(mainForm, 'Components :');

  const selectionId = 'componentsSelection';
  const selectionPointer = createSelection(subGrid2, selectionId, loadComponents, true, 'Loading...');

  const submit = createSubmitButton(mainForm);
  submit.onclick = async function (event) {
    const resultDiv = document.getElementById('result');
    if (resultDiv) resultDiv.remove();

    const stackName = input.value;
    if (!stackName) {
      appendIconMessage(mainForm, 'info', 'Stack name can not be empty');
      return;
    }
    const components = getSelectedItems(selectionPointer.selection);
    if (components.length === 0) {
      appendIconMessage(mainForm, 'info', 'Please select at least one component');
      return;
    }

    const loading = createLoading();
    mainForm.append(loading);

    let resultMessage = '';
    let resultClass = '';
    try {
      const response = await callApi('POST', apiBaseUrl + '/stacks/components', {}, {
        name: stackName,
        components: components,
      });
      const query = new URLSearchParams({
        dataName: response.short,
      }).toString();
      if (response.data) {
        resultClass = 'good';
        resultMessage = `Your stack <b>${response.name}</b> has been successfully created with identifier "${response.short}". Check it out <a href="${stackPageUrl}?${query}">here</a>`;
      } else {
        resultClass = 'info';
        resultMessage = `Your stack <b>${response.name}</b> has been locally created with identifier "${response.short}" but has failed to save it to database <i>(your stack will not persist in time)</i>. Check it out <a href="${stackPageUrl}?${query}">here</a>`;
      }
    } catch (e) {
      resultClass = 'bad';
      resultMessage = 'Error when creating stack';
    } finally {
      loading.remove();
      appendIconMessage(mainForm, resultClass, resultMessage);
    }
  };
};

editButton.onclick = function (event) {
  resetPage();

  const mainForm = appendElement(document.body, 'form', {
    class: 'mainForm',
  });

  const subGrid1 = createSubGrid(mainForm, 'Stack :');
  const stackSelectionPointer = createSelection(subGrid1, 'stacksSelection', loadComponentStacks, false);

  const subGrid2 = createSubGrid(mainForm, 'Components :');
  const componentSelectionPointer = createSelection(subGrid2, 'componentsSelection', loadComponents,  true,'Choose a stack', true);

  stackSelectionPointer.selection.main.lastElementChild.onclick = function (event) {
    let selection = componentSelectionPointer.selection;

    const userOptions = selection.userOptions;
    delete userOptions.placeHolder;

    const responseValues = stackSelectionPointer.selection.responseValues;
    const stackName = getSelectedItems(stackSelectionPointer.selection)[0];
    const selectedStack = responseValues.filter(stack => stack.short === stackName)[0];
    selection = new vanillaSelectBox(selection.domSelector, userOptions);
    selection.setValue(selectedStack.components.map(component => component.short));

    componentSelectionPointer.selection = selection;
  };

  const submit = createSubmitButton(mainForm);
  submit.onclick = async function (event) {
    const stackName = getSelectedItems(stackSelectionPointer.selection)[0];
    if (stackName === undefined) {
      appendIconMessage(mainForm, 'info', 'Please select a stack to edit');
      return;
    }
    const components = getSelectedItems(componentSelectionPointer.selection);
    if (components.length === 0) {
      appendIconMessage(mainForm, 'info', 'Please select at least one component');
      return;
    }

    const loading = createLoading();
    mainForm.append(loading);

    let resultMessage = '';
    let resultClass = '';
    try {
      const response = await callApi('PUT', apiBaseUrl + `/stacks/components/${stackName}`, {}, {
        components: components,
      });
      if (response.data) {
        resultClass = 'good';
        resultMessage = `Your stack <b>${response.name}</b> has been edited`;
      } else {
        resultClass = 'info';
        resultMessage = `Your stack <b>${response.name}</b> has been locally edited but has failed to save it to database <i>(this action will not persist in time)</i>`;
      }
    } catch (e) {
      resultClass = 'bad';
      resultMessage = 'Error when editing stack';
    } finally {
      loading.remove();
      appendIconMessage(mainForm, resultClass, resultMessage);
    }
  };
};

deleteButton.onclick = function (event) {
  resetPage();

  const mainForm = appendElement(document.body, 'form', {
    class: 'mainForm',
  });

  const subGrid1 = createSubGrid(mainForm, 'Stack :');
  const stackSelectionPointer = createSelection(subGrid1, 'stacksSelection', loadComponentStacks, false);

  const submit = createSubmitButton(mainForm, 'Delete');
  submit.onclick = async function (event) {
    const stackName = getSelectedItems(stackSelectionPointer.selection)[0];
    if (stackName === undefined) {
      appendIconMessage(mainForm, 'info', 'Please select a stack to delete');
      return;
    }

    const loading = createLoading();
    mainForm.append(loading);

    let resultMessage = '';
    let resultClass = '';
    try {
      const response = await callApi('DELETE', apiBaseUrl + `/stacks/components/${stackName}`);
      if (response.data) {
        resultClass = 'good';
        resultMessage = `Your stack <b>${response.name}</b> has been deleted`;
      } else {
        resultClass = 'info';
        resultMessage = `Your stack <b>${response.name}</b> has been locally deleted but has failed deleting it from database <i>(this action will not persist in time)</i>`;
      }
    } catch (e) {
      resultClass = 'bad';
      resultMessage = 'Error when deleting stack';
    } finally {
      loading.remove();
      appendIconMessage(mainForm, resultClass, resultMessage);
    }
  };
};