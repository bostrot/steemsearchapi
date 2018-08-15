# [steemsearchapi](https://github.com/bostrot/steemsearchapi)
A Steem Search/Indexing API mainly built for DTube.

<img src="https://i.imgur.com/NnjDNRm.png"></img>

## Usage
https://dtubeapp.cf:2053/search?q=test

Where the keyword 'test' is being searched in the whole json_metadata key. You can search for videohashes, permlinks, author, description and so on.

## How it works
It indexes new posts every minute and once a day every post from every author. This data is written into a SQLite DB. A cleanup of dead videos was intended but removed for now. All posts that do not have a videohash key will be ignored and deleted.

## GUI
https://bostrot.github.io/steemsearchapi/

Here is a simple graphic interface that lets you search our database

## TODO
Check whether the video up checker works. If not make it working.

## Limitations
As it uses a SQLite Database there are some limitations: json_metadata and every other key is returned as an escaped string.

Posts will not contain every key from the steemit api. Here is a list of keys that are included. The green ones are commented out and will not be transmitted as they either are dynamic ones or I just don't think they are needed:

<img src="https://i.imgur.com/ninmk7t.png"></img>

## Help

Join the forum if you need help: [discuss.bostrot.com](https://discuss.bostrot.com)

You are welcome to contribute with pull requests, bug reports, ideas and donations.

Bitcoin: [1ECPWeTCq93F68BmgYjUgGSV11XuzSPSeM](https://www.blockchain.com/btc/payment_request?address=1ECPWeTCq93F68BmgYjUgGSV11XuzSPSeM&currency=USD&nosavecurrency=true&message=Bostrot)

PayPal: [paypal.me/bostrot](https://paypal.me/bostrot)

Hosting: [2.50$ VPS at VULTR](https://www.vultr.com/?ref=7505919)
