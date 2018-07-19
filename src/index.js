const {
  BaseKonnector,
  requestFactory,
  signin,
  scrape,
  saveBills,
  log
} = require('cozy-konnector-libs')
const request = requestFactory({
  cheerio: true,
  json: false,
  // this allows request-promise to keep cookies between requests
  jar: true,
  debug: true
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

}

async function authenticate(username, password) {
  let loginPage
  try {
    loginPage = await request({
      url: loginUrl,
      gzip: true,
      headers: {
        'Accept-language': 'fr'
      }
    })
  } catch (error) {
    log('info', JSON.stringify(error.error))
    throw new Error(error.VENDOR_DOWN)
  }

  const hiddenFields = {}
  loginPage('input[type="hidden"]').each(function(i, elt) {
    hiddenFields[elt.attribs.name] = elt.attribs.value
  })

  const formFields = {
    ...hiddenFields,
    ctl00$PlaceHolderMain$TextBoxLogin: username,
    ctl00$PlaceHolderMain$TextBoxPass: password,
    'ctl00$PlaceHolderMain$ImageButtonConnection.x': 54,
    'ctl00$PlaceHolderMain$ImageButtonConnection.y': 12
  }

  // let $ = await request({
  //   url: loginUrl,
  //   method: 'POST',
  //   form: formFields
  // })

  // log('info', login)
  return signin({
    url: loginUrl,
    formSelector: 'form',
    formData: formFields,
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
