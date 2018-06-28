const mongoose = require('mongoose');
const redis = require('redis');
const util = require('util');


const redisUrl = 'redis://127.0.0.1:6379';
const client = redis.createClient(redisUrl);
client.get = util.promisify(client.get);
const exec = mongoose.Query.prototype.exec;

//This function will be called when we need to run cache function otherwise, the caching will be occur
mongoose.Query.prototype.cache = function(){
    this.useCache = true;
    return this;
}

mongoose.Query.prototype.exec = async function(){

    if(!this.useCache){
        return exec.apply(this,arguments);
    }

    //Object.assign is used to create a copy of object
    const key = JSON.stringify(
            Object.assign({}, this.getQuery(),{
            collection: this.mongooseCollection.name
        })
    )
    //See if we have value for 'key' in redis
    const cacheValue = await client.get(key);

    //If we do, return that
    if(cacheValue){
        const doc = JSON.parse(cacheValue);

        //This doc will return either array of objects or single object
        //We need to convert it to mongoose object and then send.

        return Array.isArray(doc)
        ? doc.map(d => new this.model(d))
        : new this.model(doc);
    }

    //Otherwise, issue the query and store the result in redis
    const result =  await exec.apply(this,arguments);
    
    client.set(key, JSON.stringify(result));
    
    return result;
}
