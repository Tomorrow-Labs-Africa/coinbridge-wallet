import * as crypto from 'crypto';
import * as utf8 from 'utf8';
import axios from 'axios';
import moment from 'moment';

import dotenv from 'dotenv';
dotenv.config();

const SERVER_URL = `${process.env.FONBNK_BASE_URL}`;
const FONBNK_CLIENT_ID = `${process.env.FONBNK_CLIENT_ID}`;
const FONBNK_CLIENT_SECRET = `${process.env.FONBNK_CLIENT_SECRET}`;

const VERIFY_ENDPOINT = "/api/v1/top-up/verify-request";
const TOPUP_ENDPOINT = "/api/v1/top-up/create-request";

const generateSignature = ({
  clientSecret,
  requestData,
  timestamp,
  endpoint,
}: {
  clientSecret: string;
  requestData?: object; //empty for GET request
  timestamp: string;
  endpoint: string;
}) => {
  let body = '';
  if (requestData) {
    body = JSON.stringify(requestData);
  }
  
  const hash = crypto.createHash('md5');
  let hmac = crypto.createHmac('sha256', Buffer.from(clientSecret, 'base64'));
  let contentMD5 = hash.update(utf8.encode(body)).digest('base64');
  let stringToSign = `${contentMD5}:${timestamp}:${endpoint}`;
  hmac.update(stringToSign);
  return hmac.digest('base64');
};

export async function airtimeTopUp(phone: string, amount: number, carrier?: string, strategy?: string): Promise<any>{

  /**
   * TODO: Implement verify top up request beforecreating request
   */
  let reqBody = {
    airtimeAmount: amount,
    recipientPhoneNumber: phone,
    carrierName: carrier ?? "Safaricom Kenya", //optional
    strategy: strategy ?? "best_price", //optional
  }

  let timestamp = moment().valueOf().toString();
  console.log("Timestamp: "+ timestamp);

  let signature = generateSignature({
    clientSecret: FONBNK_CLIENT_SECRET,
    requestData: reqBody,
    timestamp: timestamp,
    endpoint: TOPUP_ENDPOINT,
  });

  let headers = {
      'Content-Type': 'application/json',
      'x-client-id': FONBNK_CLIENT_ID,
      'x-timestamp': timestamp,
      'x-signature': signature,
  }

  return await axios.post(SERVER_URL + TOPUP_ENDPOINT, reqBody, {headers: headers})
    .then(res => {
      console.log("========= RESP ==========");
      console.log(res.data);
      return res.data;
    }).catch(err => {
      console.log(err.response.data);
      console.log(err.response.status);
      return err.response.data;
    });
}


