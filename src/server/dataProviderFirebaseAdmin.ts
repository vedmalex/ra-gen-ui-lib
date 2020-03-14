import DataProvider, {
  dataProviderConfig,
  UploadFile,
  getImageSize,
} from '../client/dataProviderV3'
import * as firebase from 'firebase-admin'
import { DeleteParams } from '../client/params'

export default class extends DataProvider {
  storage: firebase.storage.Storage
  constructor({ trackedResources }: dataProviderConfig) {
    super({
      firestore: firebase.firestore() as any,
      trackedResources,
    })
    this.storage = firebase.storage()
  }

  // async upload(
  //   fieldName: string,
  //   submittedData: object,
  //   previousData: object,
  //   id: string,
  //   resource: string,
  // ) {
  //   let resourcePath = this.resourcesPaths[resource];
  //   if (get(submittedData, fieldName) || get(previousData, fieldName)) {
  //     const oldFieldArray = Array.isArray(get(previousData, fieldName));
  //     const oldFiles = (oldFieldArray
  //       ? get(previousData, fieldName)
  //       : [get(previousData, fieldName)]
  //     ).filter(f => f);
  //     const uploadFileArray = Array.isArray(get(submittedData, fieldName));
  //     const files = (uploadFileArray
  //       ? get(submittedData, fieldName)
  //       : [get(submittedData, fieldName)]
  //     )
  //       .filter(f => f)
  //       .map(f => {
  //         if (f.type === 'base64') {
  //           console.log(f.type);
  //           f.rawFile = Buffer.from(f.src, 'base64');
  //           delete f.src;
  //         }
  //         return f;
  //       });

  //     const result = {};

  //     if (uploadFileArray) {
  //       set(result, fieldName, []);
  //     }

  //     files
  //       .filter(f => !f.rawFile)
  //       .forEach(f => {
  //         if (uploadFileArray) {
  //           set(result, [fieldName, files.indexOf(f)].join('.'), f);
  //         } else {
  //           set(result, fieldName, f);
  //         }
  //       });

  //     const rawFiles = files.filter(f => f.rawFile);
  //     for (let i = 0; i < rawFiles.length; i++) {
  //       const file = rawFiles[i];
  //       const index = files.indexOf(file);
  //       const rawFile = file.rawFile;
  //       const name = file.type === 'base64' ? file.name : rawFile.name;

  //       if (file && rawFile && name) {
  //         const ref = this.storage.bucket().file(`${resourcePath}/${id}/${fieldName}/${rawFile.name}`)
  //         ref.save(rawFile);
  //         // const snapshot = await ref.put(rawFile);
  //         let curFile: Partial<UploadFile> = {};
  //         uploadFileArray
  //           ? set(result, [fieldName, index].join('.'), curFile)
  //           : set(result, fieldName, curFile);
  //         const mdata = await ref.getMetadata()
  //         curFile.md5Hash = mdata.md5Hash;
  //         curFile.path = mdata.fullPath;
  //         curFile.name = mdata.name;
  //         curFile.uploadedAt = Date.now();
  //         // remove token from url to make it public available
  //         //
  //         curFile.src =
  //           (await ref.getSignedUrl().split('?').shift() +
  //           '?alt=media';
  //         curFile.type = rawFile.type;
  //         if (rawFile.type.indexOf('image/') === 0) {
  //           try {
  //             const imageSize = await getImageSize(file);
  //             curFile.width = imageSize.width;
  //             curFile.height = imageSize.height;
  //           } catch (e) {
  //             console.error(`Failed to get image dimensions`);
  //           }
  //         }
  //       }
  //     }

  //     const removeFromStore = [
  //       ...differenceBy(oldFiles, get(result, fieldName), 'src'),
  //       ...differenceBy(oldFiles, get(result, fieldName), 'md5Hash'),
  //     ].reduce((result, cur) => {
  //       if (result.indexOf(cur) === -1) {
  //         result.push(cur);
  //       }
  //       return result;
  //     }, []);
  //     if (removeFromStore.length > 0) {
  //       try {
  //         await Promise.all(
  //           removeFromStore
  //             .filter(f => f.path)
  //             .map(file =>
  //               this.storage
  //                 .bucket()
  //                 .file(file.path)
  //                 .delete(),
  //             ),
  //         );
  //       } catch (e) {
  //         if (e.code && e.code !== 'storage/object-not-found') {
  //           console.error(e.code);
  //         } else {
  //           console.log(e);
  //         }
  //       }
  //     }

  //     return result;
  //   }
  //   return false;
  // }

  async delete(resource: string, params?: DeleteParams) {
    const id = params?.id
    const uploadFields = this.resourcesUploadFields[resource]
      ? this.resourcesUploadFields[resource]
      : []
    const resourcePath = this.resourcesPaths[resource]
    if (uploadFields.length) {
      await Promise.all(
        uploadFields.map((fieldName) =>
          this.storage
            .bucket()
            .file(`${resourcePath}/${id}/${fieldName}`)
            .delete(),
        ),
      )
    }
    return super.delete(resource, params)
  }
}
