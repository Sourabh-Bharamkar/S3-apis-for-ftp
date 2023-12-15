const express = require('express')
const app = express();
const bodyParser = require('body-parser')
const cors = require('cors')
const { S3Client, DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand, CopyObjectCommand } = require('@aws-sdk/client-s3')
const multer = require('multer')
const path = require('path')
// const AWS = require('aws-sdk')
const mime = require('mime-types')


const storage = multer.memoryStorage();
const limits = {
    fileSize: 1024 * 1024 * 2, // 2 MB limit per file
    files: 1, // Allow only one file to be uploaded
};
const upload = multer({ storage: storage, limits: limits });



const s3Config = {
    credentials: {
        accessKeyId: 'AKIA35N7I5UJTTDQ6UE5',
        secretAccessKey: '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',
    },

    region: 'eu-north-1',
    bucket: 'expense-tracker-123',
    signatureVersion: 'v4'
};


//creating instance of s3client
const s3 = new S3Client(s3Config);



app.use(cors())
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())
app.use(express.static(path.join(__dirname, 'public')))



app.get('/', (req, res, next) => {
    res.sendFile(path.join(__dirname, 'public', '/form.html'))
})


//api for getting folder structure of s3 bucket of ftp server 
app.get('/ftp/s3/folderStructure', async (req, res, next) => {

    try {
        const accountName = req.query.accountName;
        const objects = await listObjects(accountName);
        const folderStructure = buildFolderStructure('', objects);
        console.log(JSON.stringify(folderStructure, null, 2));
        res.status(200).json({ status: 'success', folderStructureObject: folderStructure })

        function buildFolderStructure(prefix, objects) {

            const folderStructure = { name: 'root', type: 'application/folder', children: [] };
            console.log(objects)

            objects.forEach(object => {
                const keys = object.Key.split('/');
                console.log('keys of current object key: ',keys)

                //if last element of keys array is empty then remove it
                // if (keys[keys.length - 1] == '') {
                //     keys.pop();
                // }
                // console.log(keys)

                let currentFolder = folderStructure;

                keys.forEach((key, index) => {
                    console.log(index,'.....................................')
                    let flag = false;
                    //traversing current folder's children array and check for key
                    for (let i = 0; i < currentFolder.children.length; i++) {

                        if (currentFolder.children[i].name == key) {
                            currentFolder = currentFolder.children[i];
                            flag = true;
                            break;
                        }
                    }

                    //if we do not find key in children array then push it to children array
                    if (flag == false) {

                        if (index < keys.length - 2) {
                            //type of file would be application/folder for all the keys whose index less than keys.length-2
                            //add type of key as folder/application
                            currentFolder.children.push({ name: key, type: 'application/folder', children: [] })
                            //make inserted object as currentfolder
                            currentFolder = currentFolder.children[currentFolder.children.length - 1]
                        }
                        else if (index == keys.length - 1 && key == '') {
                            //simply return from this function
                            return;

                        } else if (index == keys.length - 2 && keys[keys.length - 1] == '') {
                            //adding type of file as application/folder
                            currentFolder.children.push({ name: key, type: 'application/folder', children: [] })
                            //make inserted object as currentfolder
                            currentFolder = currentFolder.children[currentFolder.children.length - 1]

                        }else if(index == keys.length - 2 && keys[keys.length - 1] != ''){
                             //adding type of file as application/folder
                             currentFolder.children.push({ name: key, type: 'application/folder', children: [] })
                             //make inserted object as currentfolder
                             currentFolder = currentFolder.children[currentFolder.children.length - 1]

                        }else{
                            currentFolder.children.push({ name: key, type: mime.lookup(key) })
                            //make inserted object as currentfolder
                            currentFolder = currentFolder.children[currentFolder.children.length - 1]

                        }




                        // if (key == 'xyz') {
                        //     console.log(mime.lookup(key))
                        // }


                        // if (mime.lookup(key)) {

                        //     currentFolder.children.push({ name: key, type: mime.lookup(key) })
                        //     //make inserted object as currentfolder
                        //     currentFolder = currentFolder.children[currentFolder.children.length - 1]


                        // } else {
                        //     //add type of key as folder/application
                        //     currentFolder.children.push({ name: key, type: 'application/folder', children: [] })
                        //     //make inserted object as currentfolder
                        //     currentFolder = currentFolder.children[currentFolder.children.length - 1]
                        // }

                    }
                });
            });
            return folderStructure;
        }


        async function listObjects(prefix) {
            try {

                const input = {
                    Bucket: "expense-tracker-123",
                    Prefix: prefix
                };
                const command = new ListObjectsV2Command(input);
                const response = await s3.send(command);
                return response.Contents;

            } catch (err) {
                console.log(err)

            }
        }


    } catch (err) {
        console.log(err)

    }


})


//api for creating folder in s3 bucket of ftp-server
app.post('/ftp/s3/create-folder', async (req, res, next) => {
    try {

        let folderPath = req.body.path;
        let folderName = req.body.folderName;

        console.log(folderPath)

        if (!folderPath || !folderName) {
            return res.status(400).json({ success: 'false', message: 'provide folder path and folder name' })
        }


        function getKey(folderPath, folderName) {

            const folderPathKeysArray = folderPath.split('/');
            //removing root from path
            folderPathKeysArray.shift();
            //object key of s3 folder ends with "/" hence we will add "/" after folderName
            return folderPathKeysArray.join('/') + '/' + folderName + '/';
        }


        const objectKey = getKey(folderPath, folderName)
        console.log(objectKey)

        const input = {
            Bucket: s3Config.bucket,
            // Key: `ftp-root/fota/${req.file.originalname}`,
            Key: objectKey
        };

        const command = new PutObjectCommand(input);
        const response = await s3.send(command);
        console.log('folder created successfully')
        console.log(response)

        res.status(200).json({ success: 'true', message: 'folder created successfully' })


    } catch (err) {
        res.status(500).json({ success: 'false', message: 'Error occured in creating s3 folder' })

    }

})


//api for uploading file from s3 bucket of ftp-server
app.post('/ftp/s3/upload', upload.single('fota-update'), async (req, res, next) => {
    try {

        let folderPath = req.body.path;   // folder path "root/ftp-root/fota
        console.log(folderPath)
        if (!folderPath) {
            return res.status(400).json({ success: 'false', message: 'cannot find folder path' })
        }

        console.log('file buffer', req.file.buffer)

        //setting filname as original filename
        const fileName = req.file.originalname;

        function getKey(folderPath, fileName) {

            const folderPathKeysArray = folderPath.split('/');
            //removing root from path
            folderPathKeysArray.shift();
            //object key of s3 folder ends with "/" hence we will add "/" 
            return folderPathKeysArray.join('/') + '/' + fileName;
        }


        const objectKey = getKey(folderPath, fileName)
        console.log(objectKey)

        const input = {
            Body: req.file.buffer,
            Bucket: s3Config.bucket,
            // Key: `ftp-root/fota/${req.file.originalname}`,
            Key: objectKey
        };

        const command = new PutObjectCommand(input);
        const response = await s3.send(command);
        console.log('file uploaded successfully')
        console.log(response)
        res.status(200).json({ success: 'true', message: 'file uploaded successfully' })


    } catch (err) {
        console.log('Error occured while uploading file')
        console.log(err)

    }


})


//api for uploading file to s3 bucket of ftp-server
app.post('/ftp/s3/delete', async (req, res, next) => {

    try {
        //file path received from frontend should be like "root/ftp-root/fota/message.txt" for files
        //file path should not end with "/"
        const deletingPath = req.body.path;
        const type = req.body.type;       //"file/folder"


        //check if user is deleting root or home or bstpl folder....
        // if he tries to delete these folders send message to him


        //function to create key from filePath
        function getKey(deletingPath) {

            const filePathKeysArray = deletingPath.split('/');
            filePathKeysArray.shift();

            if (type == 'application/folder') {
                return filePathKeysArray.join('/') + '/';
            } else {
                return filePathKeysArray.join('/')
            }

        }


        const objectKey = getKey(deletingPath)
        console.log(objectKey)

        const input = {
            "Bucket": "expense-tracker-123",
            "Key": objectKey
        };

        const command = new DeleteObjectCommand(input);
        const response = await s3.send(command);
        console.log('file deleted successfully')
        console.log(response)
        res.status(200).json({ success: 'true', message: 'file deleted successfully' })


    } catch (err) {
        console.log('Error occured while deleting file')
        console.log(err)

    }

})



app.post('/ftp/s3/rename', async (req, res, next) => {
    try {

        //To rename object from s3, we have to copy the object to new key and delete the original object

        const renamingPath = req.body.path;  //file path should be like "root/ftp-root/fota/message.txt"
        const type = req.body.type;        //'applicationn/folder'
        const oldName = req.body.oldName;
        const newName = req.body.newName;


        //creating new key and old key for file to be renamed
        console.log('inside rename api')
        console.log(renamingPath)
        console.log('newName:', newName)

        //functions to create old key and new key from file path and new name
        function getOldKey(renamingPath) {

            const filePathKeysArray = renamingPath.split('/');
            filePathKeysArray.shift();

            if (type == 'application/folder') {
                return filePathKeysArray.join('/') + '/';
            } else {
                return filePathKeysArray.join('/')
            }

        }

        function getNewKey(renamingPath, newName) {
            const filePathKeysArray = renamingPath.split('/');
            filePathKeysArray.pop()
            filePathKeysArray.shift()
            //if type is application/folder we have to append "/" 
            if (type == 'application/folder') {
                return filePathKeysArray.join('/') + '/' + newName + '/';
            } else {
                return filePathKeysArray.join('/') + '/' + newName;
            }

        }

        const oldKey = getOldKey(renamingPath);
        const newKey = getNewKey(renamingPath, newName);

        console.log('old key: ', oldKey, ' new key: ', newKey)


        //ensure old name and new name are not same
        if (oldName == newName) {
            return res.status(400).json({ success: 'false', message: 'old name and new name should be different' })
        }

        //creating input for copyObjectCommand
        let input = {
            Bucket: s3Config.bucket,
            CopySource: `/${s3Config.bucket}/${oldKey}`, // Source bucket and key
            Key: newKey // Destination object key
        };

        //copying the object to be renamed to new key 
        const copyCommand = new CopyObjectCommand(input);
        let copyCommandResponse = await s3.send(copyCommand);
        console.log(copyCommandResponse)

        //creating input for delete command
        input = {
            Bucket: s3Config.bucket,
            Key: oldKey
        }

        //delete the old object
        const deleteCommand = new DeleteObjectCommand(input)
        const deleteResponse = await s3.send(deleteCommand);
        console.log('file deleted successfully')
        console.log(deleteResponse)

        res.status(200).json({ success: 'true', message: 'file renamed successfully' })


    } catch (err) {
        console.log(err)
        res.status(500).json({ success: 'false', message: 'failed to rename file' })
    }
})



app.listen(3001, () => {
    console.log('server is listening on port 3000')
})

