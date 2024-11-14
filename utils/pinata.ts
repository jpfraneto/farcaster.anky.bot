import { PinataSDK } from "pinata-web3";
import dotenv from "dotenv";
dotenv.config();

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT,
  pinataGateway: process.env.GATEWAY_URL,
});

export async function pinataMainTest() {
  try {
    const file = await pinata.gateways.get(
      "bafybeibawzhxy5iu4jtinkldgczwt43jsufah36m4zl5b7zykfsj5sx3uu/files/1111"
    );
    console.log("THE FILE IS", file.data);
  } catch (error) {
    console.log(error);
  }
}
