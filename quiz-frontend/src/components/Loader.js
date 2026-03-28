import React from "react";

export default function Loader({ text = "Loading..." }) {
    return (
        <div className="loader-overlay">
            <div className="spinner" />
            <p className="loader-text">{text}</p>
        </div>
    );
}
