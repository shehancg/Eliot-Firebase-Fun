require("firebase-functions/logger");
const {setGlobalOptions} = require("firebase-functions/v2");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const {schedule} = require("node-cron");
// const {onRequest} = require("firebase-functions/v2/https");
const {onRequest} = require("firebase-functions/v2/https");
setGlobalOptions({maxInstances: 80});

const {initializeApp} = require("firebase-admin/app");
initializeApp();
// const db = admin.database();
const firestore = admin.firestore();
const realtimeDB = admin.database();
// Set the ignoreUndefinedProperties setting
admin.firestore().settings({ignoreUndefinedProperties: true});

// TWILIO
const twilio = require("twilio");

const twilioAccountSid = "AC10bc1503b2e1c0a9da2f22d83ef81c3d";
const twilioAuthToken = "b88b3ee4b9bad5eb788b3b016a9abb73";

const client = twilio(twilioAccountSid, twilioAuthToken);

// eslint-disable-next-line max-len
exports.ProcessNewAlertNode = functions.database.ref("/alerts/{alertId}")
    .onCreate((snapshot, context) => {
      // Get the data from the newly added node
      const newData = snapshot.val();

      // Access specific fields (e.g., log_t, alert_type)
      const rpid = newData.RPID !== undefined ? newData.RPID : "N/A";

      // eslint-disable-next-line max-len
      const alertType = newData.alertType !== undefined ? newData.alertType : "N/A";

      // eslint-disable-next-line max-len
      const deviceId = newData.deviceId !== undefined ? newData.deviceId : "N/A";

      // eslint-disable-next-line max-len
      const loginTime = newData.loginTime !== undefined ? newData.loginTime : "N/A";

      // eslint-disable-next-line max-len
      const logoutTime = newData.logoutTime !== undefined ? newData.logoutTime : "N/A";

      // eslint-disable-next-line max-len
      const requestTime = newData.requestTime !== undefined ? newData.requestTime : "N/A";

      const status = newData.status !== undefined ? newData.status : "N/A";

      // Access the alertId from the context.params
      const alertId = context.params.alertId;

      // Perform any desired actions with the new data
      // eslint-disable-next-line max-len
      console.log(`RPID: ${rpid} ALERT TYPE:${alertId} ALERT TYPE: ${alertType} DEVICE ID: ${deviceId} LOGIN TIME:${loginTime} LOGOUT TIME:${logoutTime} REQUEST TIME:${requestTime} status:${status}`);
      // eslint-disable-next-line max-len
      // You can now send emails, notifications, or perform other actions based on the new data

      return null;
    });

// eslint-disable-next-line max-len
exports.NewAlertNodeAction = functions.runWith({memory: "1GB"}).database.ref("/alerts/{alertId}")
    .onCreate(async (snapshot, context) => {
      const newData = snapshot.val();
      const rpid = newData.RPID || "N/A";
      const alertType = newData.alertType || "N/A";
      const deviceId = newData.deviceId || "N/A";
      const loginTime = newData.loginTime || "N/A";
      const logoutTime = newData.logoutTime || "N/A";
      const requestTime = newData.requestTime || "N/A";
      const status = newData.status || "N/A";
      const alertId = context.params.alertId;

      // eslint-disable-next-line max-len
      console.log(`RPID: ${rpid} ALERT ID:${alertId} ALERT TYPE: ${alertType} DEVICE ID: ${deviceId} LOGIN TIME:${loginTime} LOGOUT TIME:${logoutTime} REQUEST TIME:${requestTime} status:${status}`);

      // Access Firestore to retrieve the phoneNumber based on RPID
      try {
        // eslint-disable-next-line max-len
        const staffSnapshot = await admin.firestore().collection("staff").doc(rpid).get();
        if (staffSnapshot.exists) {
          const phoneNumber = staffSnapshot.data().phoneNo;
          // Send an SMS
          await sendSMS(phoneNumber, `Alert for RPID ${rpid}: ${alertType}`);
          console.log(`SMS sent to ${phoneNumber} for alertId: ${alertId}`);
        } else {
          console.error(`No staff record found for RPID: ${rpid}`);
        }
      } catch (error) {
        console.error(`Error accessing Firestore: ${error}`);
      }

      // Send an HTTP request to TimerFunction with the alertId
      try {
        const response = axios.get(`https://us-central1-eliotweb-hameem-group-pvt-f01.cloudfunctions.net/timerFunctionX?alertId=${alertId}`);
        console.log(`HTTP request sent to TimerFunction: ${response.data}`);
      } catch (error) {
        console.error(`Error sending HTTP request to TimerFunction: ${error}`);
      }

      // eslint-disable-next-line max-len
      console.log(`RPID: ${rpid} ALERT ID: ${alertType} DEVICE ID: ${deviceId} LOGIN TIME: ${loginTime} LOGOUT TIME: ${logoutTime} REQUEST TIME: ${requestTime} status: ${status}`);
      return null;
    });

// eslint-disable-next-line require-jsdoc
async function sendSMS(phoneNumber, message) {
  try {
    // eslint-disable-next-line max-len
    const twilioPhoneNumber = "+12564554905"; // Replace with your Twilio phone number

    const smsMessage = await client.messages.create({
      body: message,
      from: twilioPhoneNumber,
      to: phoneNumber,
    });

    console.log(`SMS sent to ${smsMessage.to}: ${smsMessage.body}`);
    return smsMessage;
  } catch (error) {
    console.error(`Error sending SMS: ${error.message}`);
    throw error;
  }
}

// eslint-disable-next-line max-len
exports.timerFunctionX = onRequest({cors: true, timeoutSeconds: 600, memory: "1GiB"}, async (req, res) => {
  try {
    // Get the alertId from the request query or body
    const alertId = req.query.alertId || req.body.alertId;

    if (!alertId) {
      throw new Error("Alert ID is required."); // Throw an error for validation
    }

    console.log(`ALERT ID:${alertId}`);

    // Wait for 1 minute (60,000 milliseconds) before executing the logic
    setTimeout(async () => {
      try {
        // Access the alert node in the Firebase Realtime Database
        // eslint-disable-next-line max-len
        const alertSnapshot = await admin.database().ref(`/alerts/${alertId}`).once("value");
        const currentStatus = alertSnapshot.val().status;

        if (currentStatus === 1) {
          // Change the status to 99 if it's currently 1
          await admin.database().ref(`/alerts/${alertId}/status`).set(99);
          res.status(200).send("Status changed to 99.");
        } else {
          res.status(200).send("Status is not 1; no change needed.");
        }
      } catch (innerError) {
        console.error(`Error accessing the database: ${innerError}`);
        res.status(500).send("Internal Server Error");
      }
    }, 10 * 60000); // 60,000 milliseconds = 1 minute
  } catch (error) {
    console.error(`Error in timerFunction: ${error.message}`);
    res.status(400).send(`Error: ${error.message}`);
  }
});

// Define a function to perform the backup
const performBackup = async () => {
  try {
    // Get data from Firebase Realtime Database
    // eslint-disable-next-line max-len
    const dataSnapshot = await realtimeDB.ref("/").once("value");
    const data = dataSnapshot.val();

    if (!data) {
      console.log("No data found in Realtime Database.");
      return;
    }

    // Handle undefined values by filtering them out
    // const cleanedData = removeUndefinedValues(data);

    // Create a dynamic Firestore document ID using the current date
    const backupDate = new Date().toISOString();
    const firestoreDocumentId = `backup_${backupDate}`;

    // Store data in Firestore with the dynamic document ID
    // eslint-disable-next-line max-len
    const firestoreCollection = firestore.collection("/backup");
    await firestoreCollection.doc(firestoreDocumentId).set(data);

    console.log("Backup completed successfully.");
  } catch (error) {
    console.error("Error performing backup:", error);
  }
};

// Schedule the backup task to run every day at 11 PM (UTC time)
schedule("15 23 * * *", () => {
  performBackup().runWith({memory: "1GB"});
});

// Export an HTTP function (optional)
exports.backupData = functions.https.onRequest((req, res) => {
  // Manually trigger the backup (useful for testing)
  performBackup().runWith({memory: "1GB"});
  res.status(200).send("Backup initiated.");
});
