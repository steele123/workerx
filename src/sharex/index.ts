import { Hono } from 'hono';
import type { App } from '../app';
import { utilityRouter } from '../utility';
import { fileRouter } from './file';
import { imgRouter } from './img';
import { linkRouter } from './link';

export const shareRouter = new Hono<App>();

shareRouter.route('/', utilityRouter);
shareRouter.route('/img', imgRouter);
shareRouter.route('/file', fileRouter);
shareRouter.route('/', linkRouter);
