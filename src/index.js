const {
  BaseKonnector,
  requestFactory,
  signin,
  scrape,
  saveBills,
  log,
  hydrateAndFilter,
  addData
} = require('cozy-konnector-libs')

const moment = require('moment')
moment.locale('fr')

const request = requestFactory({
  cheerio: true,
  json: false,
  // this allows request-promise to keep cookies between requests
  jar: true,
  debug: false
})

const baseUrl = 'https://espaceclient.aprr.fr/aprr'
const loginUrl = baseUrl + '/Pages/connexion.aspx'
const billUrl = baseUrl + '/Pages/MaConsommation/conso_factures.aspx'
const consumptionUrl = baseUrl + '/_LAYOUTS/APRR-EDGAR/GetTrajets.aspx'

module.exports = new BaseKonnector(start)

async function start(fields) {
  log('info', 'Authenticating ...')
  await authenticate(fields.login, fields.password)
  log('info', 'Successfully logged in')

  log('info', 'Fetching the list of bills')
  let $ = await request(billUrl)

  log('info', 'Parsing bills')
  const bills = parseBills($)
  log('info', 'Saving data to Cozy')
  await saveBills(bills, fields.folderPath, {
    identifiers: [
      'aprr'
    ],
    contentType: 'application/pdf'
  })

  log('info', 'Fetching the list of consumptions')
  $ = await fetchConsumptions(consumptionUrl)

  log('info', 'Parsing consumptions')
  const consumptions = parseConsumptions($)
  await saveConsumptions(consumptions)
}

async function authenticate(username, password) {
  return signin({
    url: loginUrl,
    formSelector: 'form',
    formData: $ => {
      const hiddenFields = {}
      $('input[type="hidden"]').each(function(i, elt) {
        hiddenFields[elt.attribs.name] = elt.attribs.value
      })
      return {
        ...hiddenFields,
        ctl00$PlaceHolderMain$TextBoxLogin: username,
        ctl00$PlaceHolderMain$TextBoxPass: password,
        'ctl00$PlaceHolderMain$ImageButtonConnection.x': 54,
        'ctl00$PlaceHolderMain$ImageButtonConnection.y': 12
      }
    },
    json: false,
    simple: false,
    // the validate function will check if user is logged
    validate: (statusCode, $) => {
      if ($("#ctl00_plhCustomerArea_customerArea_LinkButtonSeDeconnecter").length === 1) {
        return true
      } else {
        return false
      }
    }
  })
}

function parseBills($) {
  const bills = scrape(
    $,
    {
      id: 'td.first',
      amount: {
        sel: 'td.column3',
        parse: amount => parseFloat(amount.replace(' €', '').replace(',', '.'))
      },
      date: {
        sel: 'td.column2',
        parse: date => moment(date, 'MMM YYYY').add(moment().utcOffset(), 'm')
      },
    },
    '.tbl_factures tbody tr'
  )

  return bills.map(bill => ({
    ...bill,
    vendor: 'aprr',
    currency: '€',
    fileurl: `${billUrl}?facture=${bill.id}`,
    filename: `${bill.date.format('YYYY-MM')}_${String(bill.amount).replace('.', ',')}€_${String(bill.id)}.pdf`,
    date: bill.date.toDate(),
    metadata: {
      // it can be interesting that we add the date of import. This is not mandatory but may be
      // usefull for debugging or data migration
      importDate: new Date(),
      // document version, usefull for migration after change of document structure
      version: 1
    }
  }))
}

async function fetchConsumptions(consumptionUrl) {
  const requestJSON = requestFactory({
    cheerio: false,
    json: true,
    jar: true
  })

  return await requestJSON({
    uri: consumptionUrl,
    method: 'POST',
    body: {
      startIndex:"1",
      itemsCountInPage:"101"
    },
    json: true,
    headers: {
      'X-Requested-With': 'XMLHttpRequest'
    }
  })
}

function parseConsumptions(consumptions) {
  return consumptions.map(consumption => {
    return {
      badgeNumber: consumption.NumeroSupport,
      date: moment(consumption.Date, 'DD/MM/YYYY').toDate(),
      inPlace: consumption.GareEntreeLibelle,
      outPlace: consumption.GareSortieLibelle,
      amount: parseFloat(consumption.MontantHorsRemiseTTC.replace(' €', '').replace(',', '.')),
      currency: '€',
      metadata: {
        dateImport: new Date(),
        vendor: 'aprr',
        version: 1
      }
    }
  } )

}

function saveConsumptions(consumptions) {
  const DOCTYPE = 'io.cozy.aprr.consumptions'
  return hydrateAndFilter(consumptions, DOCTYPE, {
    keys: ['badgeNumber', 'date', 'inPlace', 'outPlace']
  }).then(entries => addData(entries, DOCTYPE))
}
