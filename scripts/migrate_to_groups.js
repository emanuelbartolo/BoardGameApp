/*
  Migration script to move top-level collections into `groups/default`.

  Usage:
    node migrate_to_groups.js --project <your-gcp-project-id> --serviceAccount <path/to/serviceAccountKey.json>

  The script will copy documents from 'shortlist', 'events', and 'polls' into
  'groups/default/shortlist', 'groups/default/events', 'groups/default/polls'.

  To delete the old top-level collections after verifying, set DELETE_OLD = true
  (BE CAREFUL).
*/

const admin = require('firebase-admin');
const argv = require('minimist')(process.argv.slice(2));

const USE_ADC = !argv.serviceAccount; // use Application Default Credentials if no serviceAccount provided

if (USE_ADC) {
  console.log('No --serviceAccount provided: attempting to use Application Default Credentials (ADC).');
  try {
    admin.initializeApp();
  } catch (err) {
    console.error('Failed to initialize admin SDK with ADC. Run `gcloud auth application-default login` or provide --serviceAccount.');
    console.error(err);
    process.exit(2);
  }
} else {
  const serviceAccount = require(argv.serviceAccount);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: argv.project || (serviceAccount.project_id),
  });
}

const db = admin.firestore();
const DELETE_OLD = !!argv.deleteOld || false; // use --deleteOld to enable deletion
const DRY_RUN = !!argv.dryRun || false; // use --dryRun to only log actions

async function copyCollectionToGroup(collName) {
  console.log(`Copying collection '${collName}' to groups/default/${collName} ...`);
  const snapshot = await db.collection(collName).get();
  console.log(`Found ${snapshot.size} documents.`);
  let count = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (DRY_RUN) {
      console.log(`[dryRun] Would copy doc ${doc.id} to groups/default/${collName}`);
    } else {
      await db.collection('groups').doc('default').collection(collName).doc(doc.id).set(data);
    }
    count++;
    if (count % 50 === 0) console.log(`  Copied ${count}...`);
  }
  console.log(`Completed copying ${count} docs from ${collName}.`);
  if (DELETE_OLD) {
    if (DRY_RUN) {
      console.log(`[dryRun] Would delete ${snapshot.size} docs from top-level ${collName}`);
    } else {
      console.log(`Deleting old '${collName}' documents...`);
      for (const doc of snapshot.docs) {
        await db.collection(collName).doc(doc.id).delete();
      }
      console.log(`Deleted old '${collName}' documents.`);
    }
  }
}

async function main() {
  try {
    await copyCollectionToGroup('shortlist');
    await copyCollectionToGroup('events');
    await copyCollectionToGroup('polls');
    console.log('Migration complete. Verify data under groups/default before deleting old collections.');
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
}

main();
