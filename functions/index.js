require("firebase-functions/logger");
const {setGlobalOptions} = require("firebase-functions/v2");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
// const {schedule} = require("node-cron");
const request = require("request");
// const {onRequest} = require("firebase-functions/v2/https");
const {onRequest} = require("firebase-functions/v2/https");
setGlobalOptions({maxInstances: 80});

const {initializeApp} = require("firebase-admin/app");
initializeApp();
// const db = admin.database();
// const firestore = admin.firestore();
const realtimeDB = admin.database();
const storage = admin.storage();
// Set the ignoreUndefinedProperties setting
admin.firestore().settings({ignoreUndefinedProperties: true});

const apiKey = "Z4ms6wbuxQ6SrMwRhUkA3kt1gURxJome5bsKDzf4";

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

// eslint-disable-next-line no-irregular-whitespace
// Alert ! [Unit - 1][Line - 3] [SMc ID - 00004] [Time : 23.45]
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
      // Declare variables for line, unit, and sewingMachineID with initial "N/A" values 01795299482
      let line = "N/A";
      let unit = "N/A";
      let sewingMachineID = "N/A";

      // Access data from eliotDevices collection and RX subcollection
      try {
        // eslint-disable-next-line max-len
        const deviceDataRef = admin.database().ref("eliotDevices").child(deviceId).child("RX");
        const deviceDataSnapshot = await deviceDataRef.once("value");
        if (deviceDataSnapshot.exists()) {
          const rxData = deviceDataSnapshot.val();
          line = rxData.line || "N/A";
          unit = rxData.unit || "N/A";
          sewingMachineID = rxData.sewingMachineID || "N/A";

          console.log("Line:", line);
          console.log("Unit:", unit);
          console.log("Sewing Machine ID:", sewingMachineID);
        } else {
          // eslint-disable-next-line max-len
          console.log("No data found in the RX subcollection for the specified device.");
        }
      } catch (error) {
        console.error("Error accessing eliotDevices collection:", error);
      }

      // eslint-disable-next-line max-len
      console.log(`RPID: ${rpid} ALERT ID:${alertId} ALERT TYPE: ${alertType} DEVICE ID: ${deviceId} LOGIN TIME:${loginTime} LOGOUT TIME:${logoutTime} REQUEST TIME:${requestTime} status:${status}`);

      // eslint-disable-next-line max-len
      console.log(`Line: ${line} Unit: ${unit} SewingMachineID: ${sewingMachineID} Time: ${requestTime}`);

      let smsSent = false; // Flag to track if SMS sending was successful

      // Access Firestore to retrieve the phoneNumber based on RPID
      try {
        // eslint-disable-next-line max-len
        const staffSnapshot = await admin.firestore().collection("staff").doc(rpid).get();
        if (staffSnapshot.exists) {
          const phoneNumber = staffSnapshot.data().phoneNo;
          // Send an SMS
          // eslint-disable-next-line max-len
          // await sendSMS(apiKey, phoneNumber, `Alert for RPID ${rpid}: ${alertType}`);
          // eslint-disable-next-line max-len
          await sendSMS(apiKey, phoneNumber, `Alert !\nLocation - ${line}\nSMc ID - ${sewingMachineID}\nTime: ${requestTime}`);
          // eslint-disable-next-line max-len
          console.log(`Alert ! [Unit - ${unit}] [Line - ${line}] [SMc ID - ${sewingMachineID}] [Time : ${requestTime}]`);
          console.log(`SMS sent to ${phoneNumber} for alertId: ${alertId}`);
          console.log(`SMS API Response:`, sendSMS); // Print the SMS response

          smsSent = true; // Set the flag to true if SMS is sent successfully
        } else {
          console.error(`No staff record found for RPID: ${rpid}`);
        }
      } catch (error) {
        console.error(`Error accessing Firestore: ${error}`);
      }

      // Update the smsStatus node based on the SMS sending result
      try {
        // eslint-disable-next-line max-len
        const smsStatusRef = admin.database().ref(`/alerts/${alertId}/smsStatus`);
        if (smsSent) {
          // If SMS was sent successfully, set smsStatus to "SENT"
          await smsStatusRef.set("SENT");
        } else {
          // If SMS sending failed, set smsStatus to "FAILED"
          await smsStatusRef.set("FAILED");
        }
      } catch (error) {
        console.error(`Error updating smsStatus: ${error}`);
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

exports.sendSmsOnEffLvChange = functions.runWith({memory: "1GB"}).database
    .ref("/operators/{operatorId}/effLv")
    .onUpdate(async (change, context) => {
      const beforeData = change.before.val();
      const afterData = change.after.val();

      if (beforeData === 1 && afterData === 0) {
        // EffLv changed from 1 to 0, send an SMS

        const operatorId = context.params.operatorId;

        // Declare variables outside the if block
        let effValue; let line; let sewingId; let supervisorId;

        // Access other fields within the same document
        // eslint-disable-next-line max-len
        const snapshot = await admin.database().ref(`/operators/${operatorId}`).once("value");
        const operatorData = snapshot.val();

        if (operatorData) {
          effValue = operatorData.effValue || "N/A";
          line = operatorData.line || "N/A";
          sewingId = operatorData.sewingId || "N/A";
          supervisorId = operatorData.cSuperviceID || "N/A";

          // Now you can use effValue, line, and sewingId
          console.log(`EffValue: ${effValue}`);
          console.log(`Line: ${line}`);
          console.log(`SewingId: ${sewingId}`);
          console.log(`supervisorId: ${supervisorId}`);
        } else {
          // eslint-disable-next-line max-len
          console.log("No data found");
        }

        // Retrieve the phone number from Firestore using supervisorId
        try {
          // eslint-disable-next-line max-len
          const staffSnapshot = await admin.firestore().collection("staff").doc(supervisorId).get();

          if (staffSnapshot.exists) {
            const phoneNumber = staffSnapshot.data().phoneNo;
            // Send an SMS
            // eslint-disable-next-line max-len
            await sendSMS(apiKey, phoneNumber, `Alert ! \nProduction Efficiency Low\nValue : ${effValue}\nLine : ${line}\nSewing ID : ${sewingId}`);
            console.log(`SMS sent to ${phoneNumber}`);
          } else {
            // eslint-disable-next-line max-len
            console.error(`No staff record found for Supervisor ID: ${supervisorId}`);
          }
        } catch (error) {
          console.error(`Error accessing Firestore: ${error}`);
        }

        // Set effLv back to 1 after sending the SMS
        await admin.database().ref(`/operators/${operatorId}/effLv`).set(1);
      }

      return null;
    });


// eslint-disable-next-line require-jsdoc
async function sendSMS(apiKey, phoneNumber, message) {
  try {
    const options = {
      method: "POST",
      url: "https://api.sms.net.bd/sendsms",
      formData: {
        api_key: apiKey,
        msg: message,
        to: phoneNumber,
      },
    };

    // eslint-disable-next-line max-len
    const response = await request(options); // Use 'await' with 'request-promise'

    console.log(`SMS sent to ${phoneNumber}: ${message}`);
    return response; // Return the response
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
/* const performBackup = async () => {
  try {
    // Get data from Firebase Realtime Database
    // eslint-disable-next-line max-len
    const dataSnapshot = await realtimeDB.ref("/").once("value");
    const data = dataSnapshot.val();

    if (!data) {
      console.log("No data found in Realtime Database.");
      return;
    }

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
};*/


const realtimeDbBackup = async (context) => {
  try {
    // Get a reference to the Realtime Database
    const databaseRef = admin.database().ref("/");

    // Export the entire Realtime Database
    const databaseSnapshot = await databaseRef.once("value");
    const databaseData = databaseSnapshot.val();

    if (!databaseData) {
      console.error("No data found in Realtime Database.");
      return null;
    }

    // Create a folder path for the storage location
    const folderPath = "REALTIME_DB_DAILY_BACKUP/";

    // Create a filename using the current date and time
    const currentDate = new Date().toISOString();
    const filename = folderPath + `REALTIME_DB_BACKUP_${currentDate}.json`;

    // Get a reference to the Firebase Storage bucket
    const bucket = storage.bucket();

    // Upload the JSON data to Firebase Storage
    const file = bucket.file(filename);
    await file.save(JSON.stringify(databaseData), {
      contentType: "application/json",
      public: true, // Make the file public
    });

    console.log(`Realtime Database exported and stored in ${filename}`);
    return null;
  } catch (error) {
    console.error("Error exporting Realtime Database:", error);
    return null;
  }
};


exports.dailyBackup = functions.runWith({
  // eslint-disable-next-line max-len
  timeoutSeconds: 540, // Set the maximum execution time to 540 seconds (9 minutes)
  memory: "1GB", // Set the memory allocation to 2GB
}).pubsub
    .schedule("30 0 * * *")
    .timeZone("Asia/Colombo")
    .onRun((context) => {
      realtimeDbBackup();
      console.log("Running daily backup task");
      return null;
    });

// Export an HTTP function
exports.backupData = functions.https.onRequest((req, res) => {
  // Manually trigger the backup (useful for testing)
  realtimeDbBackup();
  res.status(200).send("Backup initiated.");
});


// GRAPH BACKUP //

const graphBackup = async () => {
  try {
    // Get data from Firebase Realtime Database
    // eslint-disable-next-line max-len
    const dataSnapshot = await realtimeDB.ref("/graphs").once("value");
    const data = dataSnapshot.val();

    if (!data) {
      console.log("No data found in Graphs");
      return;
    }

    // Create a dynamic Firestore document ID using the current date
    const backupDate = new Date().toISOString().split("T")[0];

    // eslint-disable-next-line max-len
    // Store data in Realtime Database under a new collection named "graphBackup"
    await realtimeDB.ref(`/graphBackup/${backupDate}`).set(data);

    console.log("Graph Backup completed successfully.");
  } catch (error) {
    console.error("Error performing Graph backup:", error);
  }
};

exports.graphBackup = functions.runWith({
  // eslint-disable-next-line max-len
  timeoutSeconds: 540, // Set the maximum execution time to 540 seconds (9 minutes)
  memory: "1GB", // Set the memory allocation to 2GB
}).pubsub
    .schedule("30 0 * * *")
    .timeZone("Asia/Colombo")
    .onRun((context) => {
      graphBackup();
      console.log("Graph Backup Completed.");
      return null;
    });

// Export an HTTP function (optional)
exports.graphBackupReq = functions.https.onRequest((req, res) => {
  // Manually trigger the backup (useful for testing)
  graphBackup();
  res.status(200).send("Graph Backup initiated.");
});


// Defects Trigger //

exports.updateHourlyRMG = functions.database.ref("/defects/{defectId}/RMGpass")
    .onUpdate(async (change, context) => {
      try {
        const defectId = context.params.defectId;
        // const newValue = change.after.val();

        const currentHour = (new Date().getUTCHours() + 6) % 24;

        // eslint-disable-next-line max-len
        const graphRef = admin.database().ref(`/graphs/${defectId}/hourlyTargetVsActualTargetRMG/${currentHour}/actualRMG`);
        // await graphRef.set(newValue + 1);

        await graphRef.transaction((currentValue) => {
          // Increment the actualRMG count by 1
          return (currentValue || 0) + 1;
        });

        // eslint-disable-next-line max-len
        console.log(`Actual RMG value for hour ${currentHour} updated`);

        return null;
      } catch (error) {
        console.error(`Error updating hourly RMG: ${error}`);
        return null;
      }
    });
