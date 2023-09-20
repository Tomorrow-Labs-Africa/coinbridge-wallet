import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config();

export const getBalance = async(address:string|any) => {
    try {
        let rpcUrl = `${process.env.NODE_URL}`
        const providerInstance = new ethers.JsonRpcProvider(rpcUrl);
        const balance = await providerInstance.getBalance(address);

        return balance
        
    } catch (error) {
        console.log('Error: ', error)
        return error
        
    }

}