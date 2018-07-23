const {
  BaseKonnector,
  requestFactory,
  signin,
  scrape,
  saveBills,
  log
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

const baseUrl = 'https://espaceclient.aprr.fr/aprr/Pages'
const loginUrl = baseUrl + '/connexion.aspx'
const billUrl = baseUrl + '/MaConsommation/conso_factures.aspx'

module.exports = new BaseKonnector(start)

async function start(fields) {
  log('info', 'Authenticating ...')
  await authenticate(fields.login, fields.password)
  log('info', 'Successfully logged in')
  // The BaseKonnector instance expects a Promise as return of the function

  log('info', 'Fetching the list of documents')
  const $ = await request(billUrl)
  log('info', 'Parsing list of documents')
  const bills = await parseDocuments($)
}

function authenticate(username, password) {
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
    // the validate function will check if
    validate: (statusCode, $) => {
      if ($("#ctl00_plhCustomerArea_customerArea_LinkButtonSeDeconnecter").length === 1) {
        return true
      } else {
        return false
      }
    }
  })
}

function parseDocuments($) {
  const docs = scrape(
    $,
    {
      billId: 'td.first',
      amount: {
        sel: 'td.column3',
        parse: amount => parseFloat(amount.replace(' €', '').replace(',', '.'))
      },
      date: {
        sel: 'td.column2',
        parse: date => moment(date, 'MMM YYYY').toDate()
      }
    },
    '.tbl_factures tbody tr'
  )
  log('info', docs)
}
