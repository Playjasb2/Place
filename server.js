const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8081 });

var AWS = require("aws-sdk");

AWS.config.update({
  region: "ca-central-1",
  endpoint: "https://dynamodb.ca-central-1.amazonaws.com",
  accessKeyId: "AKIAIYXCGWSFABXPLNKA",
  secretAccessKey: "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"
});

const redis = require('redis'); // used for redis
const client = redis.createClient(6379, 'place.tvsqkd.0001.cac1.cache.amazonaws.com'); //connecting to our redis server

var docClient = new AWS.DynamoDB.DocumentClient();
 
/* var dim = 1000; // note: this is not the right dimensions!!
var board=new Array(dim);
for(var x=0;x<dim;x++){
	board[x]=new Array(dim);
	for(var y=0;y<dim;y++){
		board[x][y]={ 'r':255, 'g':255, 'b':255 };
	}
} */

var dim = 1000;

wss.on('close', function() {
    console.log('disconnected');
});

wss.broadcast = function broadcast(data) {
  wss.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
};

// for heartbeat to make sure connection is alive 
function noop() {}
function heartbeat() {
  this.isAlive = true;
}

function isValidSet(o){
	var isValid=false;
	try {
	   isValid = 
		Number.isInteger(o.x) && o.x!=null && 0<=o.x && o.x<dim &&
		Number.isInteger(o.y) && o.y!=null && 0<=o.y && o.y<dim && 
		Number.isInteger(o.colour) && o.colour != null && 0 <= o.colour && o.colour <= 15 
	} catch (err){ 
		isValid=false; 
	} 
	return isValid;
}


wss.on('connection', function(ws) {
	// heartbeat
	console.log("A user is connected.");
  	ws.isAlive = true;
  	ws.on('pong', heartbeat);
	client.get("board", function(err, reply) {
		if(!err){
			ws.send(JSON.stringify(Buffer.from(reply)));
		}	
	});
	

	// when we get a message from the client
	ws.on('message', function(message) {
		console.log(message);
		var clientMessage = JSON.parse(message);

		if(isValidSet(clientMessage)) {
			currentDate = new Date();
			console.log(String(currentDate));

			var params = {
				TableName: "user",
				KeyConditionExpression: "username = :username",
				ExpressionAttributeValues: {
						":username": clientMessage["username"]
				}
			};

			myTransaction = {
				TransactItems: [
					{
						Put: {
								TableName: "user",
								Item: {'username' : {S:clientMessage["username"]}, 
									'userTimeStamp' : {S:String(currentDate)}}
						}
					},
					{
						Put: {
								TableName: "place",
								Item: {'coordinate': {S: "(" + clientMessage["x"] + "," + clientMessage["y"] + ")"}, 
									'colour': {S: String(clientMessage["colour"])},
									'tileTimeStamp': {S: String(currentDate)},
									'username': {S: clientMessage["username"]}}
						}
					}
				]};

			myPromise = docClient.query(params).promise();

			myPromise.then((data) => {
				console.log(JSON.stringify(data));
				console.log(new Date());
					
				if(data.Count == 0 || currentDate - (new Date(data.Items[0]["userTimeStamp"])) >= 30000) {
					var dynamodb = new AWS.DynamoDB();
					return dynamodb.transactWriteItems(myTransaction).promise();
				}
				else {
					throw new Error("Can't update right now.");
				}
			}).then((data) => {
				console.log("We did it!");
				console.log(clientMessage["x"]);
				console.log(clientMessage["y"]);
				client.bitfield("board","set", "u4", String(4*parseInt(clientMessage["x"]) + 4000*parseInt(clientMessage["y"]) ), parseInt(clientMessage["colour"]));
				wss.broadcast(message);
			}).catch((err) => {
				console.log(err);
			});
		}


	});
});

// heartbeat (ping) sent to all clients
const interval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) return ws.terminate();
 
    ws.isAlive = false;
    ws.ping(noop);
  });
}, 30000);

function getind(x,y) {
    client.bitfield("board","get", "u8", String(4*x + 1000*y), function(err, reply) {
    // reply is null when the key is missing

    const buf1 = Buffer.from(reply);
    //console.log(reply.charCodeAt(7));
    console.log(buf1);
    var bits = buf1.readUInt8(0) ;
    if (x%2==0){
        return (bits >> 4) & 15
    }else{
        return bits & 15
    }
     //
});
}

