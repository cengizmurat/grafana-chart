const axios = require('axios');
const HTMLParser = require('node-html-parser');

const database = require('./database');
const config = require('./config');

let componentsCache;

const hostname = 'devstats.cncf.io';
const baseUrl = `https://${hostname}/`;

const cacheTime = parseInt(config.CACHE_TIME) // in minutes
console.log(`Cache time : ${cacheTime} minute(s)`)

database.setLogging(config.LOG_QUERIES === 'true')

setInterval(updateComponents, cacheTime * 60 * 1000);

function queryToBody(query) {
  return {
    from: "1446545259582",
    to: new Date().getTime().toString(),
    queries: [
      {
        refId: "A",
        intervalMs: 86400000,
        maxDataPoints: 814,
        datasourceId: 1,
        rawSql: query,
        format: "table"
      }
    ]
  }
}

const componentsLocalCache = {}
const companiesLocalCache = {}
const stacksLocalCache = {}

async function loadCompanies(component) {
  // retrieve companies list
  const response = await loadData(component || 'all', 'hcomcontributions', [ 'y10' ])
  const companies = response.data.rows.map(company => company.name).slice(1)

  const companiesToAdd = []
  for (const company of companies) {
    const cachedCompany = companiesLocalCache[company]
    if (!cachedCompany) {
      companiesLocalCache[company] = {}
      companiesToAdd.push(company)
    }
  }
  await saveCompaniesToDatabase(companiesToAdd.map(company => [company]))

  return companies
}

function shouldUpdateCache(cachedData, periods, companies) {
  // no cache
  if (!cachedData) {
    return true
  }

  for (const period of periods) {
    const periodCache = cachedData[period]
    if (!periodCache) {
      // no cache
      return true
    }
    if (new Date() - periodCache.updatedAt > cacheTime * 60 * 1000) {
      // cache expired
      return true
    }
  }

  return false
}

async function loadData(component, metrics, periods, companies) {
  let cachedData = loadFromCache(component, metrics, periods)

  if (shouldUpdateCache(cachedData, periods, companies)) {
    const data = await loadFromDevstats(component, metrics, periods)
    if (periods.length + 1 > data.columns.length) {
      data.columns = [data.columns[0]].concat(periods)
    }
    const rowsToAdd = saveToLocalCache(component, metrics, data)
    await saveComponentsCacheToDatabase(rowsToAdd)

    cachedData = loadFromCache(component, metrics, periods)
  }

  const rows = {}
  for (const [period, values] of Object.entries(cachedData)) {
    for (const [company, value] of Object.entries(values)) {
      if (company !== 'updatedAt') {
        let companyValue = rows[company]
        if (!companyValue) {
          companyValue = {}
          companyValue.updatedAt = values.updatedAt
          companyValue.name = company
          rows[company] = companyValue
        }
        companyValue[period] = value
      }
    }
  }

  const data = {}
  data.rows = Object.values(rows)
  data.columns = [ 'name' ].concat(periods)

  if (companies) {
    data.rows = data.rows.filter(company => companies.indexOf(company.name) !== -1)
  }

  const response = {}
  response.data = data

  return response
}

function loadFromCache(component, metrics) {
  const componentCache = componentsLocalCache[component]
  if (componentCache) {
    const metricsCache = componentCache.metrics
    if (metricsCache) {
      const metricCache = metricsCache[metrics]
      if (metricCache) {
        return metricCache
      }
    }
  }
}

async function loadFromDevstats(component, metrics, periods) {
  let query = `select name, value, period from \"shcom\" where series = '${metrics}' and period `
  if (periods.length > 1) {
    query += `in (${periods.map(p => `'${p}'`).join(', ')})`
  } else {
    query += `= '${periods[0]}'`
  }
  const response = await fetchData(component, query)
  return processData(response.data)
}

function saveToLocalCache(component, metrics, data) {
  let componentCache = componentsLocalCache[component]
  if (!componentCache) {
    componentCache = {}
    componentsLocalCache[component] = componentCache
  }

  let metricsCache = componentCache.metrics
  if (!metricsCache) {
    metricsCache = {}
    componentCache.metrics = metricsCache
  }

  let metricCache = metricsCache[metrics]
  if (!metricCache) {
    metricCache = {}
    metricsCache[metrics] = metricCache
  }

  const now = new Date()
  const mainColumn = data.columns[0]
  const columns = data.columns.slice(1)
  const rowsToAdd = []
  for (const period of columns) {
    let periodCache = metricCache[period]
    if (!periodCache) {
      periodCache = {}
      metricCache[period] = periodCache
    }
    periodCache.updatedAt = now

    for (const row of data.rows) {
      const company = row[mainColumn]
      const value = row[period] || 0
      periodCache[company] = value
      rowsToAdd.push([
        component,
        metrics,
        company,
        period,
        value,
      ])
    }
  }

  return rowsToAdd
}

async function saveComponentsCacheToDatabase(data) {
  if (data.length === 0) return

  // generate id for each row based on all columns (except last) concatenation
  data.map(row => row.unshift(row.slice(0, -1).join('-')))

  return await database.upsert(
    'components_cache',
    [
      'id',
      'component',
      'metrics',
      'company',
      'period',
      'value',
    ],
    data,
  )
}

async function saveComponentsToDatabase(data) {
  if (data.length === 0) return

  return await database.upsert(
    'components',
    [
      'short',
      'name',
      'href',
      'svg',
    ],
    data,
  )
}

async function saveCompaniesToDatabase(data) {
  if (data.length === 0) return

  return await database.upsert(
    'companies',
    [
      'name',
    ],
    data,
  )
}

async function saveCompanyStacksToDatabase(data) {
  if (data.length === 0) return

  // generate id for each row based on parent-child concatenation
  data.map(row => row.unshift(row.join('-')))

  return await database.upsert(
    'company_stacks',
    [
      'id',
      'parent',
      'name',
      'child',
    ],
    data,
  )
}

async function saveComponentStacksToDatabase(stack) {
  const stackKey = stack.short

  let stackCache = stacksLocalCache[stackKey]
  if (!stackCache) {
    stackCache = stack
    stacksLocalCache[stackKey] = stackCache
  }

  const data = []
  for (const component of stack.components) {
    data.push([
      stackKey || '',
      stack.name || '',
      component,
    ])
  }

  if (data.length === 0) return

  // generate id for each row based on parent-child concatenation
  data.map(row => row.unshift(row.join('-')))

  return await database.upsert(
    'component_stacks',
    [
      'id',
      'parent',
      'name',
      'child',
    ],
    data,
  )
}

async function deleteComponentStackFromDatabase(name) {
  const stack = stacksLocalCache[name]
  if (stack) {
    delete stacksLocalCache[name]

    await database.deleteFrom(
      'component_stacks',
      [
        `parent = '${name}'`,
      ],
    )

    return stack
  }
}

function getComponentStacks(name) {
  if (name) {
    return stacksLocalCache[name]
  }

  return Object.values(stacksLocalCache)
}

async function fetchData(component, query) {
  const body = queryToBody(query)

  const url = `https://${component ? (component + '.') : ''}${hostname}/api/tsdb/query`
  console.log(`[${new Date().toISOString()}] ${url} : ${query}`)
  return await axios.post(url, body)
}

function processData(data) {
  const table = data.results['A'].tables[0]
  table.columns = table.columns.map(obj => obj.text)

  const mainColumn = table.columns[0]
  const dictValues = {}
  const keys = [mainColumn]
  table.rows.map(function(row) {
    const x = row[0]
    let obj = dictValues[x]
    if (!obj) {
      obj = {}
      obj[mainColumn] = x
      dictValues[x] = obj
    }

    const value = row[1]
    const name = row[2]
    if (name && value) {
      keys.indexOf(name) === -1 && keys.push(name)
      obj[name] = value
    }
  })

  const out = {}
  out.rows = Object.values(dictValues)
  out.columns = keys

  return out
}

async function loadStacks(name) {
  return stacksLocalCache[name]
}

async function loadComponents() {
  if (componentsCache === undefined) {
    await updateComponents();
  }
  return componentsCache;
}

async function updateComponents() {
  const promises = [];
  const components = {};

  const response = await axios.get(baseUrl);
  const document = HTMLParser.parse(response.data);
  const elements = document.querySelectorAll('table tr a');
  for (const element of elements) {
    const href = element.getAttribute('href');
    const firstChild = element.firstChild;
    if (firstChild.nodeType === 3) { // TextNode
      const searchBegin = '://';
      const beginIndex = href.indexOf(searchBegin) + searchBegin.length;
      const endIndex = href.indexOf('.' + hostname);
      components[href] = {
        name: firstChild.rawText,
        short: href.slice(beginIndex, endIndex),
      };
    } else if (firstChild.rawTagName === 'img') {
      promises.push(
        axios.get(`${baseUrl}/${firstChild.getAttribute('src')}`).then(function(response) {
          return {
            href: href,
            data: response.data,
          };
        })
      );
    }
  }

  const svgs = await Promise.all(promises);
  for (const svg of svgs) {
    const component = components[svg.href];
    if (component) component.svg = svg.data;
  }

  componentsCache = transformComponents(components);
  await saveComponentsToDatabase(componentsCache.map(component => [
    component.short,
    component.name,
    component.href,
    component.svg,
  ]));
  return componentsCache;
}

function transformComponents(components) {
  return Object.entries(components).map(function(entry) {
    const key = entry[0];
    const value = entry[1];
    value.href = key;
    return value;
  });
}

function setStacksLocalCache(cache) {
  Object.assign(stacksLocalCache, cache)
}

module.exports = {
  loadData,
  loadStacks,
  loadCompanies,
  loadComponents,
  saveComponentStacksToDatabase,
  getComponentStacks,
  deleteComponentStackFromDatabase,
};