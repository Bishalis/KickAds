import { BsFacebook, BsLinkedin, BsGithub } from "react-icons/bs";

export function Footer() {
  return (
    <footer id="contact" className="bg-white border-t border-gray-100 py-12 px-4 sm:px-8">
      <div className="max-w-7xl mx-auto flex flex-col items-center gap-8">
        {/* Social Icons */}
        <div className="flex items-center gap-6 text-primary">
          <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="p-2.5 rounded-full hover:bg-purple-50 transition-colors" aria-label="Facebook">
            <BsFacebook className="w-6 h-6" />
          </a>
          <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="p-2.5 rounded-full hover:bg-purple-50 transition-colors" aria-label="LinkedIn">
            <BsLinkedin className="w-6 h-6" />
          </a>
          <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="p-2.5 rounded-full hover:bg-purple-50 transition-colors" aria-label="GitHub">
            <BsGithub className="w-6 h-6" />
          </a>
        </div>

        {/* Links Bar */}
        <div className="w-full max-w-3xl border-t border-gray-200 pt-8">
          <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-3 text-xs sm:text-sm font-semibold tracking-wide text-gray-700 uppercase">
            <a href="#" className="hover:text-primary transition-colors">TERMS AND CONDITIONS</a>
            <span className="text-gray-300 font-normal">|</span>
            <a href="#" className="hover:text-primary transition-colors">PRIVACY POLICIES</a>
            <span className="text-gray-300 font-normal">|</span>
            <a href="#" className="hover:text-primary transition-colors">ABOUT US</a>
            <span className="text-gray-300 font-normal">|</span>
            <a href="#" className="hover:text-primary transition-colors">CONTACT US</a>
          </div>
        </div>

        <p className="text-xs text-gray-400">
          © {new Date().getFullYear()} KickAds. All rights reserved.
        </p>
      </div>
    </footer>
  );
}