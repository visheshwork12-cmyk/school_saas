// infrastructure/terraform/modules/backup/lambda/mongodb-backup.js

const { MongoClient } = require('mongodb');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { KMSClient, EncryptCommand } = require('@aws-sdk/client-kms');

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const kmsClient = new KMSClient({ region: process.env.AWS_REGION });

exports.handler = async (event) => {
    console.log('Starting MongoDB backup process...');
    
    const {
        MONGODB_URI,
        S3_BACKUP_BUCKET,
        ENVIRONMENT,
        KMS_KEY_ID,
        BACKUP_RETENTION_DAYS
    } = process.env;
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupKey = `mongodb-backups/${ENVIRONMENT}/${timestamp}/backup.json`;
    
    let client;
    
    try {
        // Connect to MongoDB
        console.log('Connecting to MongoDB...');
        client = new MongoClient(MONGODB_URI, {
            maxPoolSize: 1,
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 30000,
        });
        
        await client.connect();
        console.log('Connected to MongoDB successfully');
        
        const db = client.db();
        
        // Get all collections
        const collections = await db.listCollections().toArray();
        console.log(`Found ${collections.length} collections to backup`);
        
        const backup = {
            timestamp: new Date().toISOString(),
            environment: ENVIRONMENT,
            collections: {}
        };
        
        // Backup each collection
        for (const collectionInfo of collections) {
            const collectionName = collectionInfo.name;
            
            // Skip system collections
            if (collectionName.startsWith('system.')) {
                continue;
            }
            
            console.log(`Backing up collection: ${collectionName}`);
            
            const collection = db.collection(collectionName);
            const documents = await collection.find({}).toArray();
            
            backup.collections[collectionName] = {
                count: documents.length,
                documents: documents
            };
            
            console.log(`Backed up ${documents.length} documents from ${collectionName}`);
        }
        
        // Convert backup to JSON
        const backupData = JSON.stringify(backup, null, 2);
        const backupSize = Buffer.byteLength(backupData, 'utf8');
        
        console.log(`Backup data size: ${(backupSize / 1024 / 1024).toFixed(2)} MB`);
        
        // Upload to S3
        console.log(`Uploading backup to S3: ${backupKey}`);
        
        const uploadParams = {
            Bucket: S3_BACKUP_BUCKET,
            Key: backupKey,
            Body: backupData,
            ContentType: 'application/json',
            ServerSideEncryption: 'aws:kms',
            SSEKMSKeyId: KMS_KEY_ID,
            Metadata: {
                'backup-type': 'mongodb-full',
                'environment': ENVIRONMENT,
                'collections-count': String(Object.keys(backup.collections).length),
                'backup-size': String(backupSize)
            },
            Tags: [
                { Key: 'Environment', Value: ENVIRONMENT },
                { Key: 'BackupType', Value: 'mongodb-automated' },
                { Key: 'Timestamp', Value: timestamp }
            ].map(tag => `${tag.Key}=${tag.Value}`).join('&')
        };
        
        await s3Client.send(new PutObjectCommand(uploadParams));
        
        console.log('Backup uploaded to S3 successfully');
        
        // Create metadata file
        const metadata = {
            backupKey,
            timestamp,
            environment: ENVIRONMENT,
            collectionsCount: Object.keys(backup.collections).length,
            totalDocuments: Object.values(backup.collections).reduce((sum, col) => sum + col.count, 0),
            backupSizeBytes: backupSize,
            retentionDate: new Date(Date.now() + (parseInt(BACKUP_RETENTION_DAYS) * 24 * 60 * 60 * 1000)).toISOString()
        };
        
        const metadataKey = `mongodb-backups/${ENVIRONMENT}/${timestamp}/metadata.json`;
        
        await s3Client.send(new PutObjectCommand({
            Bucket: S3_BACKUP_BUCKET,
            Key: metadataKey,
            Body: JSON.stringify(metadata, null, 2),
            ContentType: 'application/json',
            ServerSideEncryption: 'aws:kms',
            SSEKMSKeyId: KMS_KEY_ID
        }));
        
        console.log('Metadata file created successfully');
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                message: 'MongoDB backup completed successfully',
                backupKey,
                metadata
            })
        };
        
    } catch (error) {
        console.error('MongoDB backup failed:', error);
        
        // Send failure notification (you can integrate with SNS here)
        return {
            statusCode: 500,
            body: JSON.stringify({
                success: false,
                message: 'MongoDB backup failed',
                error: error.message
            })
        };
        
    } finally {
        if (client) {
            await client.close();
            console.log('MongoDB connection closed');
        }
    }
};
