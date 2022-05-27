require('../../helpers/mock-browser-api')

const tds = require('../../../shared/js/background/trackers.es6')
const tdsStorageStub = require('../../helpers/tds.es6')
const tdsStorage = require('../../../shared/js/background/storage/tds.es6')

const tabManager = require('../../../shared/js/background/tab-manager.es6')
const browserWrapper = require('../../../shared/js/background/wrapper.es6')
const { dropTracking3pCookiesFromResponse, dropTracking3pCookiesFromRequest } = require('../../../shared/js/background/events/3p-tracking-cookie-blocking')
const getArgumentsObject = require('../../../shared/js/background/helpers/arguments-object')

const jsdom = require('jsdom')

const trackingJsCookieProtection = require('../../../shared/content-scope-scripts/src/features/tracking-cookies-3p')

const trackingConfigReference = require('../../data/reference-tests/block-third-party-tracking-cookies/config_reference.json')
const trackingBlocklistReference = require('../../data/reference-tests/block-third-party-tracking-cookies/tracker_radar_reference.json')
const trackingTestSets = require('../../data/reference-tests/block-third-party-tracking-cookies/tests.json')

// 3p non-tracking JS currently disabled
const nonTrackingJsCookieProtection = null

const nonTrackingConfigReference = require('../../data/reference-tests/block-non-tracking-third-party-cookies/config_reference.json')
const nonTrackingBlocklistReference = require('../../data/reference-tests/block-non-tracking-third-party-cookies/tracker_radar_reference.json')
const nonTrackingTestSets = require('../../data/reference-tests/block-non-tracking-third-party-cookies/tests.json')

const { JSDOM } = jsdom

const EXT_ID = 'ogigmfedpbpnnbcpgjloacccaibkaoip'
const orgGlobalThis = globalThis

function runTestSuite (suiteType, testSet, jsCookieProtection, configReference, blocklistReference) {
    describe(`Third party ${suiteType} cookies blocking tests / ${testSet.name} /`, () => {
        beforeAll(() => {
            spyOn(browserWrapper, 'getExtensionId').and.returnValue(EXT_ID)
            tdsStorageStub.stub({ config: configReference, tds: blocklistReference })

            return tdsStorage.getLists().then(lists => tds.setLists(lists))
        })

        afterEach(() => {
            // eslint-disable-next-line no-global-assign
            globalThis = orgGlobalThis
        })

        testSet.tests.forEach(test => {
            if (test.exceptPlatforms && test.exceptPlatforms.includes('web-extension')) {
                return
            }

            if ('expectSetCookieHeadersRemoved' in test || 'expectCookieHeadersRemoved' in test) {
                it(`${test.name}`, () => {
                    tabManager.delete(1)
                    tabManager.create({
                        tabId: 1,
                        url: test.siteURL
                    })

                    if ('expectSetCookieHeadersRemoved' in test) {
                        const outputRequest = dropTracking3pCookiesFromResponse({
                            tabId: 1,
                            initiator: test.siteURL,
                            url: test.requestURL,
                            responseHeaders: test.responseHeaders,
                            type: 'script'
                        })

                        const headersAreRemoved = outputRequest.responseHeaders.find(h => h.name.toLocaleLowerCase() === 'set-cookie') === undefined

                        expect(headersAreRemoved).toBe(test.expectSetCookieHeadersRemoved)
                    } else if ('expectCookieHeadersRemoved' in test) {
                        const outputRequest = dropTracking3pCookiesFromRequest({
                            tabId: 1,
                            initiator: test.siteURL,
                            url: test.requestURL,
                            requestHeaders: test.requestHeaders,
                            type: 'script'
                        })

                        const headersAreRemoved = outputRequest.requestHeaders.find(h => h.name.toLocaleLowerCase() === 'cookie') === undefined

                        expect(headersAreRemoved).toBe(test.expectCookieHeadersRemoved)
                    }
                })
            } else if ('expectDocumentCookieSet' in test) {
                it(`${test.name}`, () => {
                    tabManager.delete(1)
                    tabManager.create({
                        tabId: 1,
                        url: test.siteURL
                    })

                    const args = getArgumentsObject(1, { url: test.frameURL || test.siteURL, frameId: test.frameURL ? 1 : 0 }, test.frameURL || test.siteURL, 'abc123')

                    const cookieJar = new jsdom.CookieJar()
                    const dom = new JSDOM(`<iframe src="${test.frameURL}"></iframe>`, {
                        url: test.siteURL,
                        cookieJar
                    })

                    // protection only works in an iframe
                    const jsdomWindow = dom.window.frames[0].window

                    // eslint-disable-next-line no-global-assign
                    globalThis = jsdomWindow

                    jsCookieProtection.init(args)

                    jsdomWindow.document.cookie = test.setDocumentCookie

                    if (test.expectDocumentCookieSet) {
                        expect(cookieJar.getCookieStringSync(test.frameURL)).toEqual(test.setDocumentCookie)
                    } else {
                        expect(cookieJar.getCookieStringSync(test.frameURL)).toEqual('')
                    }
                })
            } else {
                throw new Error(`Unknown type of test - ${test.name}`)
            }
        })
    })
}

for (const setName of Object.keys(trackingTestSets)) {
    const testSet = trackingTestSets[setName]

    runTestSuite('tracking', testSet, trackingJsCookieProtection, trackingConfigReference, trackingBlocklistReference)
}

for (const setName of Object.keys(nonTrackingTestSets)) {
    if (setName === 'cookieAPI') {
        continue
    }

    const testSet = nonTrackingTestSets[setName]

    runTestSuite('non-tracking', testSet, nonTrackingJsCookieProtection, nonTrackingConfigReference, nonTrackingBlocklistReference)
}