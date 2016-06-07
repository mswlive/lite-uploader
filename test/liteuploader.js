/*jshint -W030 */

var jsdom = require("jsdom");
global.document = jsdom.jsdom("<html><body></body></html>");
global.window = global.document.parentWindow;

var sinon = require("sinon");
var chai = require("chai");
var expect = chai.expect;
var sinonChai = require("sinon-chai");
chai.use(sinonChai);

var sandbox;
var noop = function () {};

var mockGetFiles = function () {
  return {0: {name: "file1"}, 1: {name: "file2"}, length: 2};
};

var mockEmptyGetFiles = function () {
  return {length: 0};
};
var LiteUploader = require("../liteuploader");

describe("Lite Uploader", function () {

  beforeEach(function () {
    sandbox = sinon.sandbox.create();
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe("basic instantiation", function () {
    it("should be able to be instantiated", function () {
      sandbox.stub(LiteUploader.prototype, "_applyDefaults").returns({tester: "abc"});
      var liteUploader = new LiteUploader({tester: "abc"}, noop, noop);

      expect(liteUploader).to.exist;
      expect(liteUploader.options).to.eql({tester: "abc"});
      expect(liteUploader._getFiles).to.be.a("function");
      expect(liteUploader._triggerEvent).to.be.a("function");
      expect(liteUploader.xhrs).to.eql([]);
    });

    it("should fallback to defaults if not all options are passed in", function () {
      var liteUploader = new LiteUploader({}, noop, noop);

      expect(liteUploader.options.beforeRequest).to.be.a("function");
      expect(liteUploader.options.script).to.eql(null);
      expect(liteUploader.options.ref).to.eql(null);
      expect(liteUploader.options.headers).to.eql({});
      expect(liteUploader.options.params).to.eql({});
      expect(liteUploader.options.rules).to.eql({});
      expect(liteUploader.options.singleFileUploads).to.eql(false);
    });

    it("default beforeRequest method should return a promise", function () {
      var liteUploader = new LiteUploader({}, noop, noop);

      return liteUploader.options.beforeRequest([], "formData")
        .then(function (res) {
          expect(res).to.eql("formData");
        });
    });
  });

  describe("validation", function () {
    it("should not proceed with upload if there are no files", function () {
      sandbox.stub(LiteUploader.prototype, "_startUploadWithFiles");
      sandbox.stub(LiteUploader.prototype, "_validateOptions");
      sandbox.stub(LiteUploader.prototype, "_validateFiles");
      var liteUploader = new LiteUploader({script: "script"}, function () { return undefined; }, noop);

      liteUploader._init();

      expect(liteUploader._startUploadWithFiles).not.to.have.been.called;
      expect(liteUploader._validateOptions).not.to.have.been.called;
      expect(liteUploader._validateFiles).not.to.have.been.called;
    });

    it("should not proceed with upload if there are options errors", function () {
      sandbox.stub(LiteUploader.prototype, "_validateOptions").returns("foo");
      sandbox.stub(LiteUploader.prototype, "_startUploadWithFiles");
      var liteUploader = new LiteUploader({script: "script"}, mockEmptyGetFiles, noop);

      liteUploader._init();

      expect(liteUploader._startUploadWithFiles).not.to.have.been.called;
    });

    it("should not proceed with upload if there are file errors", function () {
      sandbox.stub(LiteUploader.prototype, "_validateOptions").returns(null);
      sandbox.stub(LiteUploader.prototype, "_validateFiles").returns("bar");
      sandbox.stub(LiteUploader.prototype, "_startUploadWithFiles");
      var liteUploader = new LiteUploader({script: "script"}, mockEmptyGetFiles, noop);

      liteUploader._init();

      expect(liteUploader._startUploadWithFiles).not.to.have.been.called;
    });

    it("should emit event containing errors", function () {
      sandbox.stub(LiteUploader.prototype, "_validateOptions").returns("foo");
      var mockOnEvent = sandbox.stub();
      var liteUploader = new LiteUploader({script: "script"}, mockGetFiles, mockOnEvent);

      liteUploader._init();

      expect(mockOnEvent.callCount).to.eql(1);
      expect(mockOnEvent).to.have.been.calledWith("lu:errors", "foo");
    });

    it("should proceed with upload if no errors are found", function () {
      sandbox.stub(LiteUploader.prototype, "_validateOptions").returns(null);
      sandbox.stub(LiteUploader.prototype, "_validateFiles").returns(null);
      sandbox.stub(LiteUploader.prototype, "_startUploadWithFiles");
      var mockFileList = mockGetFiles();
      var liteUploader = new LiteUploader({script: "script"}, mockGetFiles, noop);

      liteUploader._init();

      expect(liteUploader._startUploadWithFiles).to.have.been.calledWith(mockFileList);
    });

    it("should proceed with upload with injected files if no errors are found", function () {
      sandbox.stub(LiteUploader.prototype, "_validateOptions").returns(null);
      sandbox.stub(LiteUploader.prototype, "_validateFiles").returns(null);
      sandbox.stub(LiteUploader.prototype, "_startUploadWithFiles");
      var liteUploader = new LiteUploader({script: "script"}, mockGetFiles, noop);

      liteUploader._init("foo");

      expect(liteUploader._startUploadWithFiles).to.have.been.calledWith("foo");
    });

    it("should emit event if no errors are found", function () {
      sandbox.stub(LiteUploader.prototype, "_validateOptions").returns(null);
      sandbox.stub(LiteUploader.prototype, "_validateFiles").returns(null);
      sandbox.stub(LiteUploader.prototype, "_startUploadWithFiles");
      var mockFileList = mockGetFiles();
      var mockOnEvent = sandbox.stub();
      var liteUploader = new LiteUploader({script: "script"}, mockGetFiles, mockOnEvent);

      liteUploader._init();

      expect(mockOnEvent.callCount).to.eql(1);
      expect(mockOnEvent).to.have.been.calledWith("lu:start", mockFileList);
    });
  });

  describe("upload start", function () {
    it("should upload all files in one request by default", function () {
      sandbox.stub(LiteUploader.prototype, "_beforeUpload");
      var liteUploader = new LiteUploader({script: "script"}, noop, noop);
      var mockFileList = mockGetFiles();

      liteUploader._startUploadWithFiles(mockFileList);

      expect(liteUploader._beforeUpload).to.have.been.calledOnce;
      expect(liteUploader._beforeUpload).to.have.been.calledWith(mockFileList);
    });

    it("should upload all files as separate requests if singleFileUploads option is true", function () {
      sandbox.stub(LiteUploader.prototype, "_beforeUpload");
      var liteUploader = new LiteUploader({script: "script", singleFileUploads: true}, noop, noop);
      var mockFileList = mockGetFiles();

      liteUploader._startUploadWithFiles(mockFileList);

      expect(liteUploader._beforeUpload).to.have.been.calledTwice;
      expect(liteUploader._beforeUpload.getCall(0).args[0]).to.eql([mockFileList["0"]]);
      expect(liteUploader._beforeUpload.getCall(1).args[0]).to.eql([mockFileList["1"]]);
    });
  });

  describe("before each request", function () {
    it("should emit event", function () {
      sandbox.stub(LiteUploader.prototype, "_performUpload");
      sandbox.stub(LiteUploader.prototype, "_collateFormData").returns("collated");
      var beforeRequest = sandbox.stub().returns(Promise.resolve("resolved"));
      var mockOnEvent = sandbox.stub();
      var mockFileList = mockGetFiles();
      var liteUploader = new LiteUploader({script: "script", beforeRequest: beforeRequest}, noop, mockOnEvent);

      liteUploader._beforeUpload(mockFileList);

      expect(mockOnEvent.callCount).to.eql(1);
      expect(mockOnEvent).to.have.been.calledWith("lu:before", mockFileList);
    });

    it("should proceed with upload if beforeRequest was resolved", function () {
      sandbox.stub(LiteUploader.prototype, "_performUpload");
      sandbox.stub(LiteUploader.prototype, "_collateFormData").returns("collated");
      var beforeRequest = sandbox.stub().returns(Promise.resolve("resolved"));
      var liteUploader = new LiteUploader({script: "script", beforeRequest: beforeRequest}, noop, noop);
      var mockFileList = mockGetFiles();

      return liteUploader._beforeUpload(mockFileList)
        .then(function () {
           expect(beforeRequest).to.have.been.calledWith(mockFileList, "collated");
           expect(liteUploader._performUpload).to.have.been.calledWith("resolved");
        })
    });

    it("should not proceed with upload if beforeRequest was rejected", function () {
      sandbox.stub(LiteUploader.prototype, "_performUpload");
      sandbox.stub(LiteUploader.prototype, "_collateFormData").returns("collated");
      var beforeRequest = sandbox.stub().returns(Promise.reject());
      var liteUploader = new LiteUploader({script: "script", beforeRequest: beforeRequest}, noop, noop);

      return liteUploader._beforeUpload()
        .catch(function () {
          expect(liteUploader._performUpload).not.to.have.been.called;
        })
    });
  });

  describe("options errors", function () {
    it("should return error if there is no ref set", function () {
      var liteUploader = new LiteUploader({script: "script"}, noop, noop);

      var result = liteUploader._validateOptions();

      expect(result).to.eql([{name: "_options", errors: [{type: "refRequired"}]}]);
    });

    it("should return error if the script option is blank", function () {
      var liteUploader = new LiteUploader({ref: "ref"}, noop, noop);

      var result = liteUploader._validateOptions();

      expect(result).to.eql([{name: "_options", errors: [{type: "scriptRequired"}]}]);
    });

    it("should return null if no options errors are found", function () {
      var liteUploader = new LiteUploader({script: "script", ref: "ref"}, noop, noop);

      var result = liteUploader._validateOptions();

      expect(result).to.eql(null);
    });
  });

  describe("file errors", function () {
    it("should return errors if any are found", function () {
      var allowedFileTypeValidatorStub = sandbox.stub(LiteUploader.prototype, "_allowedFileTypeValidator")
      allowedFileTypeValidatorStub.onCall(0).returns("foo");
      allowedFileTypeValidatorStub.onCall(1).returns(undefined);
      var maxSizeValidatorStub = sandbox.stub(LiteUploader.prototype, "_maxSizeValidator")
      maxSizeValidatorStub.onCall(0).returns("bar");
      maxSizeValidatorStub.onCall(1).returns("bar");
      var liteUploader = new LiteUploader({
        script: "script",
        rules: {
          allowedFileTypes: "a,b,c",
          maxSize: 20
        }}, noop, noop);

      var result = liteUploader._validateFiles(mockGetFiles());

      expect(result).to.eql([
        {name: "file1", errors: ["foo", "bar"]},
        {name: "file2", errors: ["bar"]}
      ]);
    });

    it("should return null if no errors are found", function () {
      sandbox.stub(LiteUploader.prototype, "_allowedFileTypeValidator").returns(undefined);
      sandbox.stub(LiteUploader.prototype, "_maxSizeValidator").returns(undefined);
      var liteUploader = new LiteUploader({
        script: "script",
        rules: {
          allowedFileTypes: "a,b,c"
        }}, noop, noop);

      var result = liteUploader._validateFiles(mockGetFiles());

      expect(result).to.eql(null);
    });
  });

  describe("file type validator", function () {
    it("should return undefined if the file type exactly matches an allowed type", function () {
      var liteUploader = new LiteUploader();

      var res = liteUploader._allowedFileTypeValidator("image/jpeg,image/png", {type: "image/jpeg"});

      expect(res).to.eq(undefined);
    });

    it("should return error object if the file type is not a match for the allowed file type", function () {
      var liteUploader = new LiteUploader();

      var res = liteUploader._allowedFileTypeValidator("image/gif", {type: "image/jpeg"});

      expect(res).to.eql({
        type: "type",
        rule: "image/gif",
        given: "image/jpeg"
      });
    });

    it("should return undefined if the file type matches a wildcard allowed type", function () {
      var liteUploader = new LiteUploader();

      var res = liteUploader._allowedFileTypeValidator("image/*,video/*", {type: "image/jpeg"});

      expect(res).to.eq(undefined);
    });

    it("should return error object if the file type does not match a wildcard allowed type", function () {
      var liteUploader = new LiteUploader();

      var res = liteUploader._allowedFileTypeValidator("image/*", {type: "text/plain"});

      expect(res).to.eql({
        type: "type",
        rule: "image/*",
        given: "text/plain"
      });
    });
  });

  describe("file size validator", function () {
    it("should return undefined if the file size is below limit", function () {
      var liteUploader = new LiteUploader();

      var res = liteUploader._maxSizeValidator(200, {size: 199});

      expect(res).to.eq(undefined);
    });

    it("should return error object if the file is above limit", function () {
      var liteUploader = new LiteUploader();

      var res = liteUploader._maxSizeValidator(200, {size: 201});

      expect(res).to.eql({
        type: "size",
        rule: 200,
        given: 201
      });
    });
  });

  describe("form data", function () {
    beforeEach(function () {
      var formDataObject = {
        data: [],
        append: function (key, value) {
          var obj = {};
          obj[key] = value;
          this.data.push(obj);
        },
        get: function () {
          return this.data;
        }
      };

      sandbox.stub(LiteUploader.prototype, "_getFormDataObject").returns(formDataObject);
    });

    it("should add extra params onto params hash defined on instantiation", function () {
      var liteUploader = new LiteUploader({params: {foo: "123"}}, noop, noop);

      liteUploader.addParam("bar", "456");

      expect(liteUploader.options.params).to.eql({foo: "123", bar: "456"});
    });

    it("should add any params to form data", function () {
      var liteUploader = new LiteUploader({params: {tester: 123, another: "abc"}}, noop, noop);

      var result = liteUploader._collateFormData([]);

      expect(result.get()).to.eql([{tester: 123}, {another: "abc"}]);
    });

    it("should add any files to form data", function () {
      var liteUploader = new LiteUploader({params: {}, ref: "tester"}, noop, noop);

      var result = liteUploader._collateFormData(["tester1", "tester2"]);

      expect(result.get()).to.eql([{"tester": "tester1"}, {"tester": "tester2"}]);
    });
  });

  describe("building xhr object", function () {
    var mockXmlHttpRequestObject;

    beforeEach(function () {
      mockXmlHttpRequestObject = {
        open: sandbox.spy(),
        setRequestHeader: sandbox.spy(),
        addEventListener: sandbox.spy(),
        upload: {
          addEventListener: sandbox.spy()
        }
      };

      sandbox.stub(LiteUploader.prototype, "_getXmlHttpRequestObject").returns(mockXmlHttpRequestObject);
    });

    afterEach(function () {
      mockXmlHttpRequestObject = null;
    })

    it("should open it with correct method and url", function () {
      var liteUploader = new LiteUploader({script: "abc", params: {foo: "123"}}, noop, noop);

      liteUploader._buildXhrObject();

      expect(mockXmlHttpRequestObject.open).to.have.been.calledWith("POST", "abc");
    });

    it("should set headers using passed in option", function () {
      var liteUploader = new LiteUploader({script: "abc", params: {foo: "123"}, headers: {foo: "bar", abc: "def"}}, noop, noop);

      liteUploader._buildXhrObject();

      expect(mockXmlHttpRequestObject.setRequestHeader.callCount).to.eql(2);
      expect(mockXmlHttpRequestObject.setRequestHeader.getCall(0)).to.have.been.calledWith("foo", "bar");
      expect(mockXmlHttpRequestObject.setRequestHeader.getCall(1)).to.have.been.calledWith("abc", "def");
    });

    it("should add listeners for progress and error events", function () {
      var liteUploader = new LiteUploader({script: "abc", params: {foo: "123"}, headers: {foo: "bar", abc: "def"}}, noop, noop);

      liteUploader._buildXhrObject();

      expect(mockXmlHttpRequestObject.upload.addEventListener).to.have.been.calledOnce;
      expect(mockXmlHttpRequestObject.upload.addEventListener.getCall(0).args[0]).to.eql("progress");
      expect(mockXmlHttpRequestObject.upload.addEventListener.getCall(0).args[1]).to.be.a("function");
      expect(mockXmlHttpRequestObject.upload.addEventListener.getCall(0).args[2]).to.eql(false);
      expect(mockXmlHttpRequestObject.addEventListener).to.have.been.calledOnce;
      expect(mockXmlHttpRequestObject.addEventListener.getCall(0).args[0]).to.eql("error");
      expect(mockXmlHttpRequestObject.addEventListener.getCall(0).args[1]).to.be.a("function");
      expect(mockXmlHttpRequestObject.addEventListener.getCall(0).args[2]).to.eql(false);
    });

    it("should add xhr instance to xhr array an", function () {
      var liteUploader = new LiteUploader({script: "abc", params: {foo: "123"}}, noop, noop);

      expect(liteUploader.xhrs.length).to.eql(0);
      liteUploader._buildXhrObject();

      expect(liteUploader.xhrs.length).to.eql(1);
    });

    it("should return xhr instance", function () {
      var liteUploader = new LiteUploader({script: "abc", params: {foo: "123"}}, noop, noop);

      var result = liteUploader._buildXhrObject();

      expect(result).to.eql(mockXmlHttpRequestObject);
    });
  });

  describe("perform upload", function () {
    it("should send form data using build xhr object", function () {
      var mockXhrObject = {
        send: sandbox.spy()
      };
      sandbox.stub(LiteUploader.prototype, "_buildXhrObject").returns(mockXhrObject);
      var liteUploader = new LiteUploader({script: "abc", params: {foo: "123"}}, noop, noop);

      liteUploader._performUpload("form-data");

      expect(mockXhrObject.send).to.have.been.calledWith("form-data");
    });
  });

  describe("progress event", function () {
    it("should not trigger progress event if lengthComputable is false", function () {
      var mockOnEvent = sandbox.stub();
      var liteUploader = new LiteUploader({tester: "abc"}, noop, mockOnEvent);

      liteUploader._onXHRProgress({lengthComputable: false});

      expect(mockOnEvent).not.to.have.been.called;
    });

    it("should trigger progress event if lengthComputable is true", function () {
      var mockOnEvent = sandbox.stub();
      var liteUploader = new LiteUploader({tester: "abc"}, noop, mockOnEvent);

      liteUploader._onXHRProgress({
        lengthComputable: true,
        loaded: 2.1,
        total: 10.3
      });

      expect(mockOnEvent.callCount).to.eql(1);
      expect(mockOnEvent).to.have.been.calledWith("lu:progress", 20);
    });
  })

  describe("success event", function () {
    it("should trigger success event with response", function () {
      var mockOnEvent = sandbox.stub();
      var liteUploader = new LiteUploader({tester: "abc"}, noop, mockOnEvent);

      liteUploader._onXHRSuccess("response");

      expect(mockOnEvent.callCount).to.eql(1);
      expect(mockOnEvent).to.have.been.calledWith("lu:success", "response");
    });
  });

  describe("failure event", function () {
    it("should trigger fail event with response", function () {
      var mockOnEvent = sandbox.stub();
      var liteUploader = new LiteUploader({tester: "abc"}, noop, mockOnEvent);

      liteUploader._onXHRFailure("jqXHR");

      expect(mockOnEvent.callCount).to.eql(1);
      expect(mockOnEvent).to.have.been.calledWith("lu:fail", "jqXHR");
    });
  });

  describe("start upload", function () {
    it("should call _init", function () {
      sandbox.stub(LiteUploader.prototype, "_init");
      var liteUploader = new LiteUploader({tester: "abc"}, noop, noop);

      liteUploader.startUpload();

      expect(liteUploader._init).to.have.been.called;
    });
  });

  describe("cancel upload", function () {
    it("should abort the xhr object", function () {
      var liteUploader = new LiteUploader({tester: "abc"}, noop, noop);
      liteUploader.xhrs = [{
        abort: sandbox.spy()
      }];

      liteUploader.cancelUpload();

      expect(liteUploader.xhrs[0].abort).to.have.been.called;
    });

    it("should emit event", function () {
      var mockOnEvent = sandbox.stub();
      var liteUploader = new LiteUploader({tester: "abc"}, noop, mockOnEvent);

      liteUploader.cancelUpload();

      expect(mockOnEvent.callCount).to.eql(1);
      expect(mockOnEvent).to.have.been.calledWith("lu:cancelled");
    });
  });

  describe("global object methods", function () {
    it("_getXmlHttpRequestObject should return an object", function () {
      var liteUploader = new LiteUploader({tester: "abc"}, noop, noop);

      global.XMLHttpRequest = function () {};
      var res = liteUploader._getXmlHttpRequestObject();

      expect(res).to.be.an("object");
      global.XMLHttpRequest = undefined;
    });

    it("_getFormDataObject should return an object", function () {
      var liteUploader = new LiteUploader({tester: "abc"}, noop, noop);

      global.FormData = function () {};
      var res = liteUploader._getFormDataObject();

      expect(res).to.be.an("object");
      global.FormData = undefined;
    });
  });
});
