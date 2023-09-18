import express from 'express';
import dotenv from 'dotenv';
import UssdMenu from 'ussd-menu-builder'
import mongoose from 'mongoose';
import { User } from './models/user';
import { encryptData, decryptData } from './services/encryption';
import { createWallet } from './services/createWallet';
import { sendToken } from './services/sendTokens';
import { sendSms } from './services/sendSms';
import { getBalance } from './services/getBalance';
import { airtimeTopUp } from './services/fonbnk';

dotenv.config();

const dbString:any=process.env.DATABASE_URL;

mongoose.connect(dbString)
const database=mongoose.connection

database.on('error', (error)=>{
    console.error(error)
})

database.once('connected', ()=>{
    console.log('Database connected...')
})

let menu = new UssdMenu();

const router = express.Router();
let recipentName:string=''
let recipientAmount:number;
let recipientAddress:string | any='';
let user:any = null;
let username: string;
let pin:number;
let recipientPhoneNumber:string;

menu.startState({
  run: () => {
    console.log('entrypoint reached')
  },
  next: {
    '': async () => {
        //TODO: Create and store session
        let phone = menu.args.phoneNumber;
        const query = await User.findOne({ 'phone': phone }).exec();
        console.log('retreived user'+query)
        user = query;
        if(user){
            return 'userMenu';
        }
        else {
            return 'registerMenu';
        }
    }
}
})

menu.state('registerMenu', {
  run: async() => {
    menu.con('Welcome to the Gnosis Wallet. To access services, we need you to opt in for services'+
            '\n1. Opt in' +
            '\n2. No thanks');
  },
  next: {
    '1': 'newUser',
    '2': 'optedOut'
  }

})

menu.state('newUser', {
  run: ()=>{
      //TODO: Check that username isn't taken
      menu.con("Please enter your name  e.g. john")
  },
  next: {
      '*^[A-Za-z]+$':'newUser.pin'
  }
})

menu.state('newUser.pin', {
  run: () => {
      menu.con('Enter a 4 digit PIN you will be using for verification')
      let addressName=menu.val
      console.log('username: ',addressName)
      username = addressName;
  },
  next:{
    '*^[0-9]*$':'createUser'
  }
})

menu.state('createUser', {
  run: async () => {
      let userPin=parseInt(menu.val);
      pin = userPin;

      const wallet:any = await createWallet();

      let userDetails = {
        phone: menu.args.phoneNumber,
        address: wallet.address,
        publicKey: wallet.publicKey,
        privateKey: encryptData(pin.toString(), wallet.privateKey),
        seedPhrase: encryptData(pin.toString(), wallet.seedPhrase),
        createdAt: Date.now()
      };

      let user = new User(userDetails);
      await user.save();
      // sendSms(`Hi there. Your Dhamana Wallet has been set up. It is active and linked to your number ending with XXXXXX${user.phone.slice(-3)}. \n ~Dhamana Team.`)
      menu.end("Thank you. Your request is being processed. \n A notification will be sent once registration is complete.");
  }
})

menu.state('userMenu', {
  run: async ()=>{
      menu.con('Welcome to the wallet menu' + 
      '\n1. Send Money' +
      '\n2. My Account' +
      '\n3. Withdraw to Mobile Money' +
      '\n4. Buy Airtime'
      );
  },
  next: {
      '1': 'sendMoney',
      '2': 'myAccount',
      '3': 'WithdrawToMobileMoney',
      '4': 'buyAirtime'
  }
})

menu.state('WithdrawToMobileMoney', {
    run: ()=>{
        menu.end('Coming Soon')
    }
})

// Send Money flow
menu.state('sendMoney', {
    run: ()=>{
        menu.con('Enter recipent phone number')
    },
    next: {
        '*^[0-9+]+$':'sendMoney.recipient'
    }
})

menu.state('sendMoney.recipient', {
    run: async() => {
        menu.con('Enter amount')

        // TODO convert phone string to address

        const query = await User.findOne(
            { 'phone': menu.val }).exec();

        recipientAddress = query?.address
        recipentName = menu.val
        console.log('recipent name is: ',recipentName)
    },
    next:{
        '*^[0-9]*$': 'amount',
    }
})

menu.state('amount', {
    run: () => {
        menu.con('Enter Pin')
        recipientAmount=parseInt(menu.val)
        console.log('amount: ',recipientAmount)
    },
    next:{
        '*^[0-9]*$':'pin'
    }
})

menu.state('pin', {
    run: async () => {
        console.log('pin: ', menu.val)
        let pin = menu.val;
        const query = await User.findOne({ 'phone': menu.args.phoneNumber }).exec();
        console.log('Sending user: '+query)
        user = query;
        let key = decryptData(pin, user.privateKey)
        //TODO: Check if recipient's address exists
        if(typeof(key) == 'string'){
            const receipt:any = sendToken(
              recipientAddress,
              key,
              0.0001 ,
              menu.args.phoneNumber,
          )
            menu.end('The transaction is being processed. A notification will be sent')
        }else{
          menu.end('Error verifying your request.')
        }
        
    }
})

menu.state('myAccount', {
    run: ()=>{
        menu.con('Account' + 
        '\n1. Check Balance'+
        '\n2. Account Details')
    },
    next: {
        '1':'checkBalance',
        '2':'accountDetails'
    }
})

menu.state('checkBalance', {
    run: async()=>{
        //TODO: fetch balance using address

        const getPhone = await User.findOne(
            { 'phone': menu.args.phoneNumber }).exec();

        const balance = await getBalance(getPhone?.address);
        const smsData = {
            to: menu.args.phoneNumber,
            message: `Your current balance is ${balance} USD
            \n Click here to view full details ${process.env.EXPLORER}/${getPhone?.address}`
          }
        sendSms(smsData)
        menu.end('Your account balance will be sent to you')
    }
})

menu.state('accountDetails', {
    run: ()=>{
        menu.con('Enter 4 digit Pin')
    },
    next: {
        '*^[0-9]*$':'pinPrivate'
    }
})



menu.state('pinPrivate', {
    run: async()=>{
        let userPin=menu.val;
        const getAccount = await User.findOne(
            { 'phone': menu.args.phoneNumber }).exec();
        
        let privateKey:any  =getAccount?.privateKey.toString() 
        
        const decryptedPrivateKey = decryptData(userPin, privateKey)
        const smsData = {
            to: menu.args.phoneNumber,
            message: `Your Private Key is: ${decryptedPrivateKey} . DO NOT share this with anyone
            \n View full details about your account here: ${process.env.EXPLORER}/${getAccount?.address}`
          }
        sendSms(smsData)
        menu.end('Your account details will be sent to you')
    },
})

menu.state('optedOut', {
  run: ()=>{
      menu.end('If you change your mind, dial the shortcode again')
  }
})


// Buy Airtime
menu.state('buyAirtime', {
  run: ()=>{
      menu.con('Buy Airtime for ' +
      '\n1. My Number'+
      '\n2. Other Number')
  },
  next: {
      '1':'buyAirtime.myNumber',
      '2':'buyAirtime.otherNumber'
  }
})

// 1. Buy Airtime for My Number
menu.state('buyAirtime.myNumber', {
  run: async() => {
      menu.con('Enter amount')

      // TODO convert phone string to address
      const query = await User.findOne({ 'phone': menu.args.phoneNumber }).exec();
      console.log('Sending user: '+query)
      user = query;
  },
  next:{
      '*^[0-9]*$': 'buyAirtime.myNumber.pin',
  }
})

menu.state('buyAirtime.myNumber.pin', {
  run: () => {
      menu.con('Enter Pin')
      recipientAmount=parseInt(menu.val)
      console.log('amount: ',recipientAmount)
  },
  next:{
      '*^[0-9]*$':'buyAirtime.myNumber.pinConfirm'
  }
})

menu.state('buyAirtime.myNumber.pinConfirm', {
  run: async () => {
      console.log('pin: ', menu.val)
      let pin = menu.val;

      let key = decryptData(pin, user.privateKey)
      let phoneNum = user.phone;
      if(phoneNum.startsWith('+')){
          phoneNum = phoneNum.substring(1)
      }
      //TODO: Check Account Balance first
      if(typeof(key) == 'string'){
          let receipt:any = await airtimeTopUp(
            phoneNum,
            recipientAmount,
        )
          console.log('receipt: ', receipt)
          if(typeof(receipt.requestId) == 'string'){
            menu.end('The transaction is being processed. A notification will be sent.') 
            const smsData = {
              to: menu.args.phoneNumber,
              message: `Dear Customer, \n Your Airtime request for ${receipt.airtimeAmount} was sent successfully. Your requestId is ${receipt.requestId}. \n Thank you.`
            }
            sendSms(smsData) 
          }
          else{
            menu.end('Error placing top up request.')
          }
      
      }else{
        menu.end('Error verifying your request.')
      }
      
  }
})

// 2. Buy Airtime for Other Number
menu.state('buyAirtime.otherNumber', {
  run: ()=>{
      menu.con('Enter recipent phone number (in the format 254XXXXXXXXX) ')
  },
  next: {
      '*^[0-9+]+$':'buyAirtime.otherNumber.amount'
  }
})

menu.state('buyAirtime.otherNumber.amount', {
  run: async() => {
      menu.con('Enter amount')

      recipientPhoneNumber=menu.val;
      console.log("sending airtime to:"+ recipientPhoneNumber);
  },
  next:{
      '*^[0-9]*$': 'buyAirtime.otherNumber.pin',
  }
})

menu.state('buyAirtime.otherNumber.pin', {
  run: () => {
      menu.con('Enter Pin')
      recipientAmount=parseInt(menu.val)
      console.log('amount: ',recipientAmount)
  },
  next:{
      '*^[0-9]*$':'buyAirtime.otherNumber.pinConfirm'
  }
})

menu.state('buyAirtime.otherNumber.pinConfirm', {
  run: async () => {
      console.log('pin: ', menu.val)
      let pin = menu.val;

      let key = decryptData(pin, user.privateKey)
      let phoneNum = recipientPhoneNumber;
      if(phoneNum.startsWith('+')){
          phoneNum = phoneNum.substring(1)
      }
      //TODO: Check Account Balance first
      if(typeof(key) == 'string'){
          let receipt:any = await airtimeTopUp(
            phoneNum,
            recipientAmount,
        )
          console.log('receipt: ', receipt)
          if(typeof(receipt.requestId) == 'string'){
            menu.end('The transaction is being processed. A notification will be sent.') 
            const smsData = {
              to: menu.args.phoneNumber,
              message: `Dear Customer, \n Your Airtime request for ${receipt.airtimeAmount} to phone number ${receipt.recipientPhoneNumber} was sent successfully. Your requestId is ${receipt.requestId}. \n Thank you.`
            }
            sendSms(smsData) 
          }
          else{
            menu.end('Error placing top up request.')
          }
      
      }else{
        menu.end('Error verifying your request.')
      }
      
  }
})



router.post("/", (req, res) => {
    let args ={
        sessionId: req.body.sessionId,
        serviceCode: req.body.serviceCode,
        phoneNumber: req.body.phoneNumber,
        text: req.body.text
    }
    menu.run(args, (ussdResult: any) => {
        res.send(ussdResult);
    });

  });
  
module.exports = router;