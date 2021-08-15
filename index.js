const puppeteer = require('puppeteer');
const readline = require("readline");
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const requestPrompt = async (prompt) => {
    return new Promise((res) => {
        rl.question(prompt, function (value) {
            res(value)
        });
    })
}

function convertDate(inputFormat) {
    function pad(s) { return (s < 10) ? '0' + s : s; }
    var d = new Date(inputFormat)
    return [pad(d.getDate()), pad(d.getMonth() + 1), d.getFullYear()].join('/')
}

function parseDateFromString(string) {
    const components = string.split(", ");
    const date = `${components[1]} ${components[2]}`;
    return convertDate(date);
}

function sleep(ms) {
    return new Promise((res) => {
        setTimeout(() => {
            res(true);
        }, ms)
    })
}

const authenticatePortal = async (browser) => {
    const phone = await requestPrompt("Input Phone: ");
    const page = await browser.newPage();
    await page.goto('https://vaccination.slhd.nsw.gov.au/vc/SydneyOlympicPark/2');
    const phoneInput = await page.waitForSelector('#mobile-number');
    await phoneInput.type(phone);
    const button = await page.waitForSelector('#login-mobile');
    await button.click();

    const otp = await requestPrompt("Input OTP: ");
    const otpInput = await page.waitForSelector('#otp-password');
    await otpInput.type(otp);

    const submitButton = await page.waitForSelector('#otp-submit');
    await submitButton.click();
    const registerlink = await page.waitForSelector('.btn.btn-sm.btn-primary.text-white');
    await registerlink.click();
}

async function selectFirstOption(page, selector) {
    await sleep(200);
    await page.waitForSelector(`${selector} option`)
    console.log(`Options for ${selector} ready`)

    let firstOptionValue = null;
    while (!firstOptionValue) {
        const options = await page.$$(`${selector} option`);
        for (const option of options) {
            const value = await option.evaluate(el => el.value);
            if (value !== 'NULL') {
                firstOptionValue = value;
            }
        }
        await sleep(200);
    }
    console.log(`Changing ${selector} value to ${firstOptionValue}`);
    await page.$eval(selector, (el, value) => {
        el.value = value;
        const event = new Event('change');
        el.dispatchEvent(event);
    }, firstOptionValue);
}

const openNewPortalSessionAndChooseOptions = async (browser, dateString) => {
    const page = await browser.newPage();
    try {
        await page.goto('https://vaccination.slhd.nsw.gov.au/vc/appointment-requests');
        console.log('Waiting for Appointment 1 picker');
        await page.waitForSelector('#dose1DatePicker');
        await page.$eval('#dose1DatePicker', (el, value) => {
            el.value = value;
            const event = new Event('change');
            el.dispatchEvent(event);
        }, dateString);

        console.log('Waiting for Appointment 1 time');
        await selectFirstOption(page, 'select#dose1-appointment-time');

        console.log('Waiting for Appointment 2 time');
        await selectFirstOption(page, 'select#dose2-appointment-time');

        console.log('Submitting');
        const submitButton = await page.waitForSelector('button#appointment-request-submit-button');
        await submitButton.click();
    } catch (error) {
        console.log(error);
        page.close();
    }
}

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    await authenticatePortal(browser);

    const page = await browser.newPage();
    await page.goto('https://covidqueue.com/');

    // select pfizer
    const button = await page.waitForSelector('.pfizer-button');
    await button.click();

    // wait for a slot to open
    let success = false;
    while (!success) {
        try {
            const container = await page.waitForSelector('.dates-container-op');
            const links = await container.$$('p');
            for (const link of links) {
                const text = await link.evaluate(el => el.textContent);
                if (text.includes('💉💉')) {
                    try {
                        console.log('Slot found');
                        const date = parseDateFromString(text);
                        console.log(`Booking in for ${date}`);
                        await openNewPortalSessionAndChooseOptions(browser, date);
                        success = true;
                    } catch (error) {
                        console.log(error);
                        console.log('Failed')
                    }

                }
            }
        } catch (error) {
            console.log(`Failure fetching Sydney Olympic Park dates`);
        }
        await sleep(1000);
    }
    console.log(`Boom, you're vaccinated!`);
    await browser.close();
})();